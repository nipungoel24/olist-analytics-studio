-- Synthetic test fixtures for fan-out correctness
-- These fixtures are designed to expose join bugs

-- Test order with multiple items, multiple payments, multiple reviews
-- This is the "dangerous" order that reveals fan-out bugs

-- Customers
INSERT INTO raw.customers (customer_id, customer_unique_id, customer_zip_code_prefix, customer_city, customer_state)
VALUES
  ('cust-001', 'unique-001', '01001', 'Sao Paulo', 'SP'),
  ('cust-002', 'unique-002', '02000', 'Rio de Janeiro', 'RJ')
ON CONFLICT (customer_id) DO NOTHING;

-- Geolocation with duplicate prefix (01001 appears twice)
INSERT INTO raw.geolocation (geolocation_zip_code_prefix, geolocation_lat, geolocation_lng, geolocation_city, geolocation_state)
VALUES
  ('01001', -23.5505, -46.6333, 'Sao Paulo', 'SP'),
  ('01001', -23.5506, -46.6334, 'Sao Paulo', 'SP'),
  ('02000', -22.9068, -43.1729, 'Rio de Janeiro', 'RJ')
ON CONFLICT DO NOTHING;

-- Sellers
INSERT INTO raw.sellers (seller_id, seller_zip_code_prefix, seller_city, seller_state)
VALUES
  ('seller-001', '01001', 'Sao Paulo', 'SP'),
  ('seller-002', '02000', 'Rio de Janeiro', 'RJ')
ON CONFLICT (seller_id) DO NOTHING;

-- Products
INSERT INTO raw.products (product_id, product_category_name)
VALUES
  ('prod-001', 'eletronicos'),
  ('prod-002', NULL)
ON CONFLICT (product_id) DO NOTHING;

-- Category translation (only one translated, one not)
INSERT INTO raw.product_category_name_translation (product_category_name, product_category_name_english)
VALUES ('eletronicos', 'electronics')
ON CONFLICT (product_category_name) DO NOTHING;

-- Test order: 2 items, 3 payments, 2 reviews
INSERT INTO raw.orders (order_id, customer_id, order_status, order_purchase_timestamp, order_delivered_customer_date, order_estimated_delivery_date)
VALUES
  ('order-001', 'cust-001', 'delivered', '2017-03-15 10:00:00+00', '2017-03-25 14:00:00+00', '2017-03-30 10:00:00+00'),
  ('order-002', 'cust-002', 'delivered', '2017-06-20 08:00:00+00', '2017-06-28 16:00:00+00', '2017-07-01 10:00:00+00')
ON CONFLICT (order_id) DO NOTHING;

-- 2 items for order-001
INSERT INTO raw.order_items (order_id, order_item_id, product_id, seller_id, price, freight_value)
VALUES
  ('order-001', 1, 'prod-001', 'seller-001', 100.00, 15.00),
  ('order-001', 2, 'prod-002', 'seller-001', 50.00, 10.00),
  ('order-002', 1, 'prod-001', 'seller-002', 200.00, 20.00)
ON CONFLICT (order_id, order_item_id) DO NOTHING;

-- 3 payments for order-001 (mixed payment types)
INSERT INTO raw.order_payments (order_id, payment_sequential, payment_type, payment_installments, payment_value)
VALUES
  ('order-001', 1, 'credit_card', 3, 100.00),
  ('order-001', 2, 'credit_card', 1, 40.00),
  ('order-001', 3, 'boleto', 1, 25.00),
  ('order-002', 1, 'credit_card', 1, 220.00)
ON CONFLICT (order_id, payment_sequential) DO NOTHING;

-- 2 reviews for order-001 (should be deduplicated to 1 canonical)
INSERT INTO raw.order_reviews (review_id, order_id, review_score, review_creation_date, review_answer_timestamp)
VALUES
  ('review-001', 'order-001', 4, '2017-03-26 10:00:00+00', '2017-03-27 12:00:00+00'),
  ('review-002', 'order-001', 5, '2017-03-28 14:00:00+00', '2017-03-29 16:00:00+00'),
  ('review-003', 'order-002', 3, '2017-06-29 10:00:00+00', '2017-06-30 12:00:00+00')
ON CONFLICT (review_id, order_id) DO NOTHING;
