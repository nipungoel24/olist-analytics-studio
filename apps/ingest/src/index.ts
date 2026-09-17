import { Client } from 'pg'
import { createReadStream, existsSync, readFileSync, statSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import { parse } from 'csv-parse'

const DATABASE_URL = process.env['DATABASE_URL']
const DATASET_URL = process.env['DATASET_URL'] || 'https://www.kaggle.com/api/v1/datasets/download/olistbr/brazilian-ecommerce'
const DATA_DIR = '/tmp/olist-data'
const ZIP_FILE = join(DATA_DIR, 'dataset.zip')
const MIGRATIONS_DIR = '/app/migrations'

const EXPECTED_FILES: Record<string, string[]> = {
  'olist_orders_dataset.csv': ['order_id', 'customer_id', 'order_status', 'order_purchase_timestamp', 'order_approved_at', 'order_delivered_carrier_date', 'order_delivered_customer_date', 'order_estimated_delivery_date'],
  'olist_customers_dataset.csv': ['customer_id', 'customer_unique_id', 'customer_zip_code_prefix', 'customer_city', 'customer_state'],
  'olist_order_items_dataset.csv': ['order_id', 'order_item_id', 'product_id', 'seller_id', 'shipping_limit_date', 'price', 'freight_value'],
  'olist_order_payments_dataset.csv': ['order_id', 'payment_sequential', 'payment_type', 'payment_installments', 'payment_value'],
  'olist_order_reviews_dataset.csv': ['review_id', 'order_id', 'review_score', 'review_comment_title', 'review_comment_message', 'review_creation_date', 'review_answer_timestamp'],
  'olist_products_dataset.csv': ['product_id', 'product_category_name', 'product_name_lenght', 'product_description_lenght', 'product_photos_qty', 'product_weight_g', 'product_length_cm', 'product_height_cm', 'product_width_cm'],
  'olist_sellers_dataset.csv': ['seller_id', 'seller_zip_code_prefix', 'seller_city', 'seller_state'],
  'olist_geolocation_dataset.csv': ['geolocation_zip_code_prefix', 'geolocation_lat', 'geolocation_lng', 'geolocation_city', 'geolocation_state'],
  'product_category_name_translation.csv': ['product_category_name', 'product_category_name_english'],
}

const TABLE_MAP: Record<string, string> = {
  'olist_orders_dataset.csv': 'raw.orders',
  'olist_customers_dataset.csv': 'raw.customers',
  'olist_order_items_dataset.csv': 'raw.order_items',
  'olist_order_payments_dataset.csv': 'raw.order_payments',
  'olist_order_reviews_dataset.csv': 'raw.order_reviews',
  'olist_products_dataset.csv': 'raw.products',
  'olist_sellers_dataset.csv': 'raw.sellers',
  'olist_geolocation_dataset.csv': 'raw.geolocation',
  'product_category_name_translation.csv': 'raw.product_category_name_translation',
}

function log(msg: string) {
  process.stderr.write(`[ingest] ${msg}\n`)
}

async function runMigrations(client: Client): Promise<void> {
  log('Running database migrations')
  const migrationFiles = ['init.sql', '001-raw-tables.sql', '002-analytics-foundations.sql', '003-app-schema.sql']

  for (const file of migrationFiles) {
    const filePath = join(MIGRATIONS_DIR, file)
    if (!existsSync(filePath)) {
      log(`  Skipping ${file} (not found)`)
      continue
    }
    const sql = readFileSync(filePath, 'utf-8')
    await client.query(sql)
    log(`  Applied ${file}`)
  }
}

async function downloadDataset(): Promise<void> {
  if (existsSync(ZIP_FILE)) {
    const stat = statSync(ZIP_FILE)
    if (stat.size > 1000000) {
      log(`ZIP already exists (${stat.size} bytes), skipping download`)
      return
    }
  }

  log(`Downloading dataset from ${DATASET_URL}`)
  const maxRetries = 3
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      execSync(`curl -L -o "${ZIP_FILE}" --connect-timeout 30 --max-time 300 --retry 2 --retry-delay 5 "${DATASET_URL}"`, {
        stdio: 'pipe',
        timeout: 360000,
      })
      const stat = statSync(ZIP_FILE)
      if (stat.size < 1000000) {
        throw new Error(`Downloaded file too small (${stat.size} bytes)`)
      }
      log(`Download complete: ${stat.size} bytes`)
      return
    } catch (err) {
      log(`Download attempt ${attempt} failed: ${err}`)
      if (attempt === maxRetries) throw err
      await new Promise(r => setTimeout(r, 2000 * attempt))
    }
  }
}

function unzipDataset(): void {
  log('Extracting ZIP archive')
  try {
    execSync(`unzip -o "${ZIP_FILE}" -d "${DATA_DIR}"`, { stdio: 'pipe' })
    log('Extraction complete')
  } catch (err) {
    throw new Error(`Failed to extract ZIP: ${err}`)
  }
}

function validateFiles(): void {
  log('Validating CSV files')
  const files = Object.keys(EXPECTED_FILES)
  for (const file of files) {
    const filePath = join(DATA_DIR, file)
    if (!existsSync(filePath)) {
      throw new Error(`Missing required file: ${file}`)
    }
    // Check file is not empty
    const stat = statSync(filePath)
    if (stat.size === 0) {
      throw new Error(`Empty file: ${file}`)
    }
  }
  log(`All ${files.length} files validated`)
}

function computeChecksum(): string {
  log('Computing checksums')
  const checksums: Record<string, string> = {}
  for (const file of Object.keys(EXPECTED_FILES)) {
    const filePath = join(DATA_DIR, file)
    const hash = execSync(`sha256sum "${filePath}" | cut -d' ' -f1`, { encoding: 'utf-8' }).trim()
    checksums[file] = hash
  }
  // Combined checksum
  const combined = Object.values(checksums).sort().join(':')
  const combinedHash = execSync(`echo -n "${combined}" | sha256sum | cut -d' ' -f1`, { encoding: 'utf-8' }).trim()
  log(`Combined checksum: ${combinedHash}`)
  return combinedHash
}

async function importCSV(file: string, table: string): Promise<number> {
  const filePath = join(DATA_DIR, file)
  const headers = EXPECTED_FILES[file]
  if (!headers) throw new Error(`Unknown file: ${file}`)

  log(`Importing ${file} -> ${table}`)

  const client2 = new Client({ connectionString: DATABASE_URL })
  await client2.connect()

  try {
    await client2.query('BEGIN')

    const records: unknown[][] = []
    const parser = createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        bom: true,
      })
    )

    let rowCount = 0
    for await (const record of parser) {
      const row = headers.map(h => {
        const val = (record as Record<string, string>)[h]
        return val === '' || val === undefined ? null : val
      })
      // Skip rows where the first column (PK) is null
      if (row[0] !== null) {
        records.push(row)
      }
      rowCount++
      if (rowCount <= 3) {
        log(`  Sample record: ${JSON.stringify(record)}`)
        log(`  Mapped row: ${JSON.stringify(row)}`)
      }
    }
    log(`  Parsed ${rowCount} records, ${records.length} valid`)

    // Insert in batches using parameterized queries
    const batchSize = 1000
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize)
      const values: unknown[] = []
      const placeholders: string[] = []

      batch.forEach((row, rowIdx) => {
        const rowPlaceholders = row.map((_, colIdx) => `$${rowIdx * headers.length + colIdx + 1}`)
        placeholders.push(`(${rowPlaceholders.join(', ')})`)
        values.push(...row)
      })

      const insertSQL = `INSERT INTO ${table} (${headers.join(', ')}) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`
      await client2.query(insertSQL, values)
    }

    await client2.query('COMMIT')
    log(`  Imported ${records.length} rows into ${table}`)
    return records.length
  } catch (err) {
    await client2.query('ROLLBACK')
    throw err
  } finally {
    await client2.end()
  }
}

async function checkExistingVersion(client: Client, checksum: string): Promise<boolean> {
  const result = await client.query(
    'SELECT version_id FROM app.dataset_versions WHERE source_checksum = $1',
    [checksum]
  )
  return result.rows.length > 0
}

async function recordDatasetVersion(
  client: Client,
  checksum: string,
  rowCounts: Record<string, number>
): Promise<string> {
  const result = await client.query(
    `INSERT INTO app.dataset_versions (source_url, source_checksum, file_checksums, row_counts, migration_version)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING version_id`,
    [
      DATASET_URL,
      checksum,
      JSON.stringify({}),
      JSON.stringify(rowCounts),
      '001',
    ]
  )
  return result.rows[0].version_id
}

async function activateDataset(client: Client, versionId: string): Promise<void> {
  await client.query(
    `INSERT INTO app.active_dataset (id, dataset_version_id)
     VALUES (1, $1)
     ON CONFLICT (id) DO UPDATE SET dataset_version_id = $1, activated_at = NOW()`,
    [versionId]
  )
}

async function main(): Promise<void> {
  log('=== Olist Data Ingest Starting ===')

  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  // Ensure data directory exists
  execSync(`mkdir -p "${DATA_DIR}"`, { stdio: 'pipe' })

  // Download
  await downloadDataset()

  // Unzip
  unzipDataset()

  // Validate
  validateFiles()

  // Compute checksum
  const checksum = computeChecksum()

  // Connect to database
  const client = new Client({ connectionString: DATABASE_URL })
  await client.connect()

  try {
    // Run migrations first
    await runMigrations(client)

    // Check if this version already exists
    const exists = await checkExistingVersion(client, checksum)
    if (exists) {
      log('Dataset version already imported, skipping')
      return
    }

    // Import all CSVs in a transaction
    log('Starting transactional import')
    await client.query('BEGIN')

    try {
      const rowCounts: Record<string, number> = {}
      const importOrder = [
        'olist_customers_dataset.csv',
        'olist_geolocation_dataset.csv',
        'olist_orders_dataset.csv',
        'olist_order_items_dataset.csv',
        'olist_order_payments_dataset.csv',
        'olist_order_reviews_dataset.csv',
        'olist_products_dataset.csv',
        'olist_sellers_dataset.csv',
        'product_category_name_translation.csv',
      ]

      for (const file of importOrder) {
        const table = TABLE_MAP[file]
        if (!table) throw new Error(`No table mapping for ${file}`)
        rowCounts[file] = await importCSV(file, table)
      }

      // Record version
      const versionId = await recordDatasetVersion(client, checksum, rowCounts)

      // Activate
      await activateDataset(client, versionId)

      await client.query('COMMIT')
      log(`Import complete. Version: ${versionId}`)
      log('Row counts:')
      for (const [file, count] of Object.entries(rowCounts)) {
        log(`  ${file}: ${count}`)
      }
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    }
  } finally {
    await client.end()
  }

  log('=== Ingest Complete ===')
}

main().catch((err) => {
  log(`FATAL: ${err}`)
  process.exit(1)
})
