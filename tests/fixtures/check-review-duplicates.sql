-- Diagnostic: Check if source CSV has duplicate review_ids with different order_ids
-- This loads the CSV into a temp table and analyzes duplicates

CREATE TEMPORARY TABLE raw_reviews_import (
    review_id TEXT,
    order_id TEXT,
    review_score INT,
    review_comment_title TEXT,
    review_comment_message TEXT,
    review_creation_date TIMESTAMPTZ,
    review_answer_timestamp TIMESTAMPTZ
);

-- Copy from the CSV file (will be loaded via docker cp)
\copy raw_reviews_import FROM '/tmp/reviews-check.csv' WITH (FORMAT csv, HEADER true);

-- Analysis
SELECT 'total_rows' AS metric, count(*) AS value FROM raw_reviews_import
UNION ALL
SELECT 'distinct_review_ids', count(DISTINCT review_id) FROM raw_reviews_import
UNION ALL
SELECT 'duplicate_review_id_count', count(*) FROM (
    SELECT review_id FROM raw_reviews_import GROUP BY review_id HAVING count(*) > 1
) sub;

-- Show duplicate review_ids with their order_ids
SELECT review_id, count(*) AS occurrences, array_agg(DISTINCT order_id) AS order_ids
FROM raw_reviews_import
GROUP BY review_id
HAVING count(*) > 1
ORDER BY count(*) DESC
LIMIT 20;

-- Check if duplicate review_ids have DIFFERENT order_ids (lossy dedup)
SELECT 'duplicates_with_different_orders' AS metric, count(*) AS value
FROM (
    SELECT review_id, count(DISTINCT order_id) AS distinct_orders
    FROM raw_reviews_import
    GROUP BY review_id
    HAVING count(*) > 1 AND count(DISTINCT order_id) > 1
) sub;

DROP TABLE raw_reviews_import;
