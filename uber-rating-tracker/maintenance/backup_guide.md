# Uber Rating Tracker Backup Guide

## バックアップ推奨タイミング

- 本番利用前
- OCR調整前
- 大型アップデート前
- データ削除前

---

# D1バックアップ方法

Cloudflare Dashboard
↓
D1
↓
uber-rating-db
↓
Export

でSQLバックアップできます。

---

# ローカルへ保存推奨

保存先例：

```text
/backup/uber-rating-tracker/
```

---

# テストデータだけ削除

```bash
wrangler d1 execute uber-rating-db --file=./maintenance/delete_seed.sql
```

---

# 全データ削除

```bash
wrangler d1 execute uber-rating-db --file=./maintenance/reset_all.sql
```

注意：

- 評価履歴
- 配達履歴
- 分析履歴

すべて削除されます。
