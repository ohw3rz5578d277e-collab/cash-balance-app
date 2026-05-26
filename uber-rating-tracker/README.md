# Uber Rating Tracker

iPhone / Android / PC対応のUber配達評価トラッカー。

## 特徴

- スクショを端末内OCR解析
- 画像アップロードなし
- Cloudflare D1同期
- PWA対応
- iPhone / Android / PC対応
- 👍 👎 差分分析
- BAD増加候補分析

## 技術構成

- Cloudflare Workers
- Cloudflare D1
- HTML / CSS / JavaScript
- Tesseract.js
- PWA

## D1 作成

```bash
wrangler d1 create uber-rating-db
```

## schema適用

```bash
wrangler d1 execute uber-rating-db --file=./uber-rating-tracker/schema.sql
```

## デプロイ

```bash
wrangler deploy
```

## 今後追加予定

- OCR自動補正
- BAD候補分析
- 店舗分析
- 時間帯分析
- GPS連携
- 配達完了ワンタップ
