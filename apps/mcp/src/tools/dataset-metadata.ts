import { type DatasetMetadataInput } from '@olist/contracts'
import { getDateExtent, getSupportedCategories, getSupportedStates, getDataVersion, getRowCounts } from '../analytics/dataset-metadata.js'
import type { ToolResponse } from '@olist/contracts'

export const DATASET_METADATA_TOOL = {
  name: 'dataset_metadata',
  title: 'Dataset Metadata',
  description: `Returns metadata about the active Olist e-commerce dataset.
Includes date range, supported product categories, supported Brazilian states, data version, and row counts.
Use this tool to discover what data is available before running analytical queries.`,
  inputSchema: {},
}

export async function handleDatasetMetadata(
  _input: DatasetMetadataInput
): Promise<ToolResponse> {
  const tool = 'dataset_metadata'

  try {
    const [dateExtent, categories, states, dataVersion, rowCounts] = await Promise.all([
      getDateExtent(),
      getSupportedCategories(),
      getSupportedStates(),
      getDataVersion(),
      getRowCounts(),
    ])

    return {
      ok: true,
      tool,
      data: [{
        dateRange: { from: dateExtent.min_date, to: dateExtent.max_date },
        categories,
        states,
        dataVersion,
        rowCounts,
      }],
      columns: [
        { name: 'dateRange', type: 'object' },
        { name: 'categories', type: 'array' },
        { name: 'states', type: 'array' },
        { name: 'dataVersion', type: 'string' },
        { name: 'rowCounts', type: 'object' },
      ],
      meta: {
        rowCount: 1,
        grain: 'dataset',
        units: {},
        filters: {},
        assumptions: [
          'Dataset contains historical Olist e-commerce data from 2016-2018',
          'Review scores are canonical (one per order, deduplicated)',
          'Revenue = SUM(item.price), excluding freight',
        ],
        dataVersion,
      },
    }
  } catch (err) {
    return {
      ok: false,
      tool,
      error: {
        code: 'DATABASE_ERROR',
        message: `Failed to retrieve dataset metadata: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
      },
    }
  }
}
