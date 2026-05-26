# Uber Rating Tracker Deploy Checklist

## 1. Wrangler login

```bash
wrangler login
```

---

## 2. D1 create

```bash
npm run db:create
```

wrangler.toml に database_id を貼り付ける。

---

## 3. schema apply

```bash
npm run db:schema
```

---

## 4. seed apply 任意

```bash
npm run db:seed
```

---

## 5. local dev

```bash
npm run dev
```

確認：

- 満足度が見える
- GOOD/BADが見える
- 配達完了が押せる
- OCRが動く
- 履歴が保存される
- 分析タブが見える

---

## 6. deploy

```bash
npm run deploy
```

---

## 7. iPhone PWA化

SafariでURLを開く
↓
共有
↓
ホーム画面に追加

---

## 8. Android PWA化

ChromeでURLを開く
↓
ホーム画面に追加

---

## 9. 実配達テスト

確認ポイント：

- 配達中に押しやすいか
- OCRが速いか
- GOOD/BADが見やすいか
- ワンタップで記録できるか
- BAD増加時に候補が出るか

---

## 10. 今後の改善候補

- OCR切り抜き最適化
- BAD通知
- iPhoneショートカット連携
- 店舗候補入力
- エリア自動入力
- AI分析
