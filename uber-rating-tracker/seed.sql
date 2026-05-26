-- Uber Rating Tracker seed data
-- 動作確認用のサンプルデータです。
-- 本番利用前に不要なら削除してOKです。

INSERT INTO rating_snapshots (
  id, recorded_at, satisfaction,
  merchant_good, merchant_bad,
  customer_good, customer_bad,
  total_good, total_bad,
  delta_good, delta_bad,
  source_device, note,
  created_at, updated_at
) VALUES
('sample-rating-001', strftime('%s','now','-3 hours') * 1000, 93, 9, 0, 84, 7, 93, 7, 0, 0, 'seed', '初期サンプル', strftime('%s','now','-3 hours') * 1000, strftime('%s','now','-3 hours') * 1000),
('sample-rating-002', strftime('%s','now','-2 hours') * 1000, 92, 9, 0, 83, 8, 92, 8, -1, 1, 'seed', 'BAD増加サンプル', strftime('%s','now','-2 hours') * 1000, strftime('%s','now','-2 hours') * 1000),
('sample-rating-003', strftime('%s','now','-1 hours') * 1000, 93, 9, 0, 84, 7, 93, 7, 1, -1, 'seed', 'GOOD回復サンプル', strftime('%s','now','-1 hours') * 1000, strftime('%s','now','-1 hours') * 1000);

INSERT INTO deliveries (
  id, completed_at, store_name, area, memo, lat, lng, created_at, updated_at
) VALUES
('sample-delivery-001', strftime('%s','now','-2 hours','-35 minutes') * 1000, 'マクドナルド梅田店', '梅田', '店舗待ちあり', NULL, NULL, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
('sample-delivery-002', strftime('%s','now','-2 hours','-20 minutes') * 1000, 'ローソン大阪駅前店', '梅田', '置き配', NULL, NULL, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
('sample-delivery-003', strftime('%s','now','-2 hours','-5 minutes') * 1000, 'すき家なんば店', '難波', 'ダブル配達', NULL, NULL, strftime('%s','now') * 1000, strftime('%s','now') * 1000),
('sample-delivery-004', strftime('%s','now','-50 minutes') * 1000, 'マクドナルド梅田店', '梅田', 'ワンタップ記録', NULL, NULL, strftime('%s','now') * 1000, strftime('%s','now') * 1000);
