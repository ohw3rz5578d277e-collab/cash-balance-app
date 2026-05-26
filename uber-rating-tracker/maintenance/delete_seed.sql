-- seed.sql のサンプルデータだけ削除

DELETE FROM rating_snapshots
WHERE source_device = 'seed';

DELETE FROM deliveries
WHERE id LIKE 'sample-delivery-%';
