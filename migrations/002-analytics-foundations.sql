-- Analytics foundations: pre-aggregated views to prevent fan-out

-- Items by order: one row per order with merchandise and freight totals
CREATE OR REPLACE VIEW analytics.items_by_order AS
SELECT
    order_id,
    SUM(price) AS merchandise_total,
    SUM(freight_value) AS freight_total,
    COUNT(*) AS item_count
FROM raw.order_items
GROUP BY order_id;

-- Payments by order: keep payment lines separate for payment-type aggregation,
-- but provide order-level summary when joining order-level measures
CREATE OR REPLACE VIEW analytics.payments_by_order AS
SELECT
    order_id,
    payment_sequential,
    payment_type,
    payment_installments,
    payment_value
FROM raw.order_payments;

-- Order-level payment summary (for joining with orders)
CREATE OR REPLACE VIEW analytics.payment_summary_by_order AS
SELECT
    order_id,
    SUM(payment_value) AS total_payment_value,
    COUNT(*) AS payment_line_count,
    STRING_AGG(DISTINCT payment_type, ', ') AS payment_types
FROM raw.order_payments
GROUP BY order_id;

-- Canonical reviews: one row per order under PRD deduplication
-- Deduplication: latest answer timestamp, then creation date, then stable row tie-break (review_id)
CREATE OR REPLACE VIEW analytics.canonical_reviews AS
WITH ranked AS (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY order_id
            ORDER BY
                review_answer_timestamp DESC NULLS LAST,
                review_creation_date DESC NULLS LAST,
                review_id
        ) AS rn
    FROM raw.order_reviews
)
SELECT
    review_id,
    order_id,
    review_score,
    review_comment_title,
    review_comment_message,
    review_creation_date,
    review_answer_timestamp
FROM ranked
WHERE rn = 1;

-- Order categories: distinct order/category pairs
CREATE OR REPLACE VIEW analytics.order_categories AS
SELECT DISTINCT
    oi.order_id,
    p.product_category_name,
    COALESCE(t.product_category_name_english, 'Untranslated category') AS category_english
FROM raw.order_items oi
JOIN raw.products p ON oi.product_id = p.product_id
LEFT JOIN raw.product_category_name_translation t ON p.product_category_name = t.product_category_name;

-- Order sellers: distinct order/seller pairs
CREATE OR REPLACE VIEW analytics.order_sellers AS
SELECT DISTINCT
    order_id,
    seller_id
FROM raw.order_items;

-- Geolocation by prefix: deterministic aggregate with one row per prefix
CREATE OR REPLACE VIEW analytics.geolocation_by_prefix AS
SELECT
    geolocation_zip_code_prefix,
    AVG(geolocation_lat) AS avg_lat,
    AVG(geolocation_lng) AS avg_lng,
    MODE() WITHIN GROUP (ORDER BY geolocation_city) AS city,
    MODE() WITHIN GROUP (ORDER BY geolocation_state) AS state
FROM raw.geolocation
GROUP BY geolocation_zip_code_prefix;

-- Orders with customer state (for destination-based queries)
CREATE OR REPLACE VIEW analytics.orders_with_customer AS
SELECT
    o.order_id,
    o.customer_id,
    o.order_status,
    o.order_purchase_timestamp,
    o.order_approved_at,
    o.order_delivered_carrier_date,
    o.order_delivered_customer_date,
    o.order_estimated_delivery_date,
    c.customer_unique_id,
    c.customer_state,
    c.customer_zip_code_prefix
FROM raw.orders o
JOIN raw.customers c ON o.customer_id = c.customer_id;

-- Orders with seller state (for seller-based queries)
CREATE OR REPLACE VIEW analytics.orders_with_seller AS
SELECT DISTINCT
    o.order_id,
    o.order_status,
    o.order_purchase_timestamp,
    o.order_delivered_customer_date,
    o.order_estimated_delivery_date,
    oi.seller_id,
    s.seller_state,
    s.seller_zip_code_prefix
FROM raw.orders o
JOIN raw.order_items oi ON o.order_id = oi.order_id
JOIN raw.sellers s ON oi.seller_id = s.seller_id;
