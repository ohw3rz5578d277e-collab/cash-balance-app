-- Uber Rating Tracker / 全データ削除
-- 注意：評価履歴・配達履歴がすべて消えます。
-- 本番利用前のテストデータ削除用です。

DELETE FROM rating_snapshots;
DELETE FROM deliveries;
DELETE FROM app_events;
