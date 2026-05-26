# Uber Rating Tracker / 実運用開始手順

この手順通りに進めると、実際にiPhone / Androidで使い始められます。

---

# 0. まず確認

このアプリは、Uber Driverアプリの中身を直接取得しません。

安全寄りの流れ：

```text
配達完了 → ワンタップ記録
評価画面 → スクショ選択 → 端末内OCR → 数字だけ保存
```

スクショ画像はサーバーに送信しません。

---

# 1. ターミナルでリポジトリを取得

```bash
git clone https://github.com/ohw3rz5578d277e-collab/cash-balance-app.git
cd cash-balance-app/uber-rating-tracker
```

---

# 2. 依存関係を入れる

```bash
npm install
```

---

# 3. Cloudflareにログイン

```bash
npx wrangler login
```

ブラウザが開くので、Cloudflareにログインして許可します。

---

# 4. D1データベースを作成

```bash
npm run db:create
```

表示される以下の部分をコピーします。

```toml
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

---

# 5. wrangler.tomlを編集

`wrangler.toml` の以下を探します。

```toml
database_id = "REPLACE_WITH_D1_DATABASE_ID"
```

ここを、さきほどコピーした database_id に差し替えます。

---

# 6. テーブル作成

```bash
npm run db:schema
```

---

# 7. 最初の見た目確認用データを入れる 任意

画面の見た目を先に確認したい場合だけ実行します。

```bash
npm run db:seed
```

実運用前に消す場合は、アプリ内の「管理」タブからサンプルデータだけ削除できます。

---

# 8. ローカルで確認

```bash
npm run dev
```

表示されたURLを開きます。

確認すること：

- 満足度が大きく見える
- GOOD / BAD が大きく見える
- 「配達完了」が押せる
- 「評価を読む」でスクショ選択できる
- OCR後に数字を修正できる
- 保存後、履歴に残る

---

# 9. 本番デプロイ

```bash
npm run deploy
```

完了後、以下のようなURLが表示されます。

```text
https://uber-rating-tracker.xxxxx.workers.dev
```

このURLが実際に使うURLです。

---

# 10. iPhoneでホーム画面追加

1. Safariで本番URLを開く
2. 共有ボタンを押す
3. 「ホーム画面に追加」
4. 名前を「評価Tracker」にする
5. ホーム画面から起動

---

# 11. Androidでホーム画面追加

1. Chromeで本番URLを開く
2. 右上メニューを押す
3. 「ホーム画面に追加」
4. 名前を「評価Tracker」にする
5. ホーム画面から起動

---

# 12. 実際の使い方

## 配達完了時

ホーム画面の大ボタン：

```text
配達完了
```

を押すだけです。

## 評価確認時

1. Uber Driverアプリで評価画面をスクショ
2. 評価Trackerを開く
3. 「評価を読む」を押す
4. スクショを選ぶ
5. GOOD / BAD の数字を確認
6. 保存

---

# 13. 初日テスト方法

最初の1日は、以下だけでOKです。

```text
配達完了ボタンを押す
評価画面が見れた時だけスクショOCRする
```

店舗名やエリアは、最初から無理に入力しなくてOKです。

---

# 14. 実運用チェック

1日使ったあとに確認：

- 配達完了を押し忘れないか
- OCRが読み取れるか
- GOOD / BAD が見やすいか
- BAD増加候補が出るか
- iPhone / Androidで同期されるか

---

# 15. トラブル時

## DB未接続と出る

`wrangler.toml` の database_id が未設定の可能性があります。

## 保存できない

D1 schema が未実行の可能性があります。

```bash
npm run db:schema
```

## OCRが遅い

初回だけTesseract.jsの読み込みで時間がかかることがあります。

## サンプルデータを消したい

アプリの「管理」タブから、

```text
サンプルデータだけ削除
```

を押します。

---

# 16. 本番前におすすめ

実配達前に1回だけ、架空の流れでテストします。

```text
1. 配達完了を押す
2. 評価画面スクショを選ぶ
3. GOOD/BADを保存
4. 履歴を見る
5. 管理からバックアップを書き出す
```

これができれば、実運用開始OKです。
