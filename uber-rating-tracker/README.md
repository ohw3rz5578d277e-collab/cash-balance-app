# Uber Rating Tracker

Uber Eats配達員向けの評価トラッカーです。  
iPhone / Android / PC で使えるPWAとして作っています。

## できること

- スマホで現在評価を大きく表示
- 配達完了をワンタップ記録
- 評価スクショを端末内OCR解析
- スクショ画像はアップロードしない
- 保存するのは数字のみ
- GOOD / BAD 差分を自動計算
- BADが増えた直前の配達候補を表示
- 店舗別 / エリア別 / 時間帯別のBAD候補分析
- iPhone / Android / PCでクラウド同期

## 構成

- Cloudflare Workers
- Cloudflare D1
- PWA
- Tesseract.js
- Chart.js

---

# 1. 初回セットアップ

このフォルダに移動します。

```bash
cd uber-rating-tracker
```

Wranglerが未インストールなら入れます。

```bash
npm install -g wrangler
```

Cloudflareにログインします。

```bash
wrangler login
```

---

# 2. D1データベース作成

```bash
wrangler d1 create uber-rating-db
```

実行後に、以下のような表示が出ます。

```toml
[[d1_databases]]
binding = "DB"
database_name = "uber-rating-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

この `database_id` を `wrangler.toml` の `REPLACE_WITH_D1_DATABASE_ID` と差し替えてください。

---

# 3. テーブル作成

```bash
wrangler d1 execute uber-rating-db --file=./schema.sql
```

---

# 4. 動作確認用データ投入 任意

最初から画面の見え方を確認したい場合だけ実行します。

```bash
wrangler d1 execute uber-rating-db --file=./seed.sql
```

本番利用時は seed.sql は不要です。

---

# 5. ローカル確認

```bash
wrangler dev
```

表示されたURLを開きます。

確認すること：

- ホームに満足度が大きく表示される
- GOOD / BAD が見える
- 配達完了ボタンを押せる
- OCR画面でスクショを選べる
- 履歴に保存される

---

# 6. 本番デプロイ

```bash
wrangler deploy
```

完了後に出るURLが本番URLです。

例：

```text
https://uber-rating-tracker.<your-subdomain>.workers.dev
```

---

# 7. スマホで使う方法

## iPhone

1. Safariで本番URLを開く
2. 共有ボタンを押す
3. 「ホーム画面に追加」
4. ホーム画面から起動

## Android

1. Chromeで本番URLを開く
2. メニューを押す
3. 「ホーム画面に追加」
4. ホーム画面から起動

---

# 8. 実際の使い方

## 配達完了時

ホーム画面の大きいボタン：

```text
配達完了
```

を押します。

これだけで、完了時刻と位置情報が保存されます。

## 評価確認時

1. Uber Driverアプリで評価画面をスクショ
2. 評価トラッカーを開く
3. 「評価を読む」を押す
4. スクショを選ぶ
5. 数字を確認
6. 保存

---

# 9. 注意点

このアプリは、Uberの内部データを直接取得しません。  
スクショから数字を読み取り、前回との差分を記録する安全寄りの設計です。

BAD候補分析は、評価者を断定するものではありません。  
「BADが増えた直前に近い配達」を候補として出す推測分析です。

---

# 10. 次の改善候補

- OCR切り抜き精度アップ
- iPhoneショートカット連携
- BAD増加通知
- 店舗名の候補入力
- エリア自動推定
- AIによるBAD原因要約
