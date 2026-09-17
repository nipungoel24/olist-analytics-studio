-- Raw Olist tables
-- These tables store the raw imported CSV data

CREATE TABLE IF NOT EXISTS raw.orders (
    order_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    order_status TEXT,
    order_purchase_timestamp TIMESTAMPTZ,
    order_approved_at TIMESTAMPTZ,
    order_delivered_carrier_date TIMESTAMPTZ,
    order_delivered_customer_date TIMESTAMPTZ,
    order_estimated_delivery_date TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS raw.customers (
    customer_id TEXT PRIMARY KEY,
    customer_unique_id TEXT NOT NULL,
    customer_zip_code_prefix TEXT,
    customer_city TEXT,
    customer_state TEXT
);

CREATE TABLE IF NOT EXISTS raw.order_items (
    order_id TEXT NOT NULL,
    order_item_id INT NOT NULL,
    product_id TEXT,
    seller_id TEXT,
    shipping_limit_date TIMESTAMPTZ,
    price NUMERIC(10,2),
    freight_value NUMERIC(10,2),
    PRIMARY KEY (order_id, order_item_id)
);

CREATE TABLE IF NOT EXISTS raw.order_payments (
    order_id TEXT NOT NULL,
    payment_sequential INT NOT NULL,
    payment_type TEXT,
    payment_installments INT,
    payment_value NUMERIC(10,2),
    PRIMARY KEY (order_id, payment_sequential)
);

CREATE TABLE IF NOT EXISTS raw.order_reviews (
    review_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    review_score INT,
    review_comment_title TEXT,
    review_comment_message TEXT,
    review_creation_date TIMESTAMPTZ,
    review_answer_timestamp TIMESTAMPTZ,
    PRIMARY KEY (review_id, order_id)
);

CREATE TABLE IF NOT EXISTS raw.products (
    product_id TEXT PRIMARY KEY,
    product_category_name TEXT,
    product_name_lenght INT,
    product_description_lenght INT,
    product_photos_qty INT,
    product_weight_g INT,
    product_length_cm INT,
    product_height_cm INT,
    product_width_cm INT
);

CREATE TABLE IF NOT EXISTS raw.sellers (
    seller_id TEXT PRIMARY KEY,
    seller_zip_code_prefix TEXT,
    seller_city TEXT,
    seller_state TEXT
);

CREATE TABLE IF NOT EXISTS raw.geolocation (
    geolocation_zip_code_prefix TEXT NOT NULL,
    geolocation_lat NUMERIC(10,7),
    geolocation_lng NUMERIC(10,7),
    geolocation_city TEXT,
    geolocation_state TEXT
);

CREATE TABLE IF NOT EXISTS raw.product_category_name_translation (
    product_category_name TEXT PRIMARY KEY,
    product_category_name_english TEXT
);

-- Indexes for common joins and filters
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON raw.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_purchase_ts ON raw.orders(order_purchase_timestamp);
CREATE INDEX IF NOT EXISTS idx_orders_status ON raw.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON raw.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON raw.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller_id ON raw.order_items(seller_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON raw.order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_order_id ON raw.order_reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON raw.products(product_category_name);
CREATE INDEX IF NOT EXISTS idx_customers_unique_id ON raw.customers(customer_unique_id);
CREATE INDEX IF NOT EXISTS idx_customers_state ON raw.customers(customer_state);
CREATE INDEX IF NOT EXISTS idx_sellers_state ON raw.sellers(seller_state);
CREATE INDEX IF NOT EXISTS idx_geolocation_prefix ON raw.geolocation(geolocation_zip_code_prefix);
