# CChess Client

`client/` 是中國象棋前端，包含：

- 單機明棋
- 單機暗棋
- 雙人連線明棋
- 雙人連線暗棋

## 開發命令

```bash
npm run dev
npm run lint
npm run build
```

## 連線模式依賴

- Firebase Anonymous Auth
- Firebase Realtime Database
- Firebase App Check

公開站只提供遊戲功能，不提供管理介面。

## 目前連線模式現況

- 房號為 **5 碼純數字**
- 對局結束後可選擇繼續遊戲或返回主選單
- 明棋連線視角會依玩家身份翻面：
  - 紅方在下
  - 黑方在下
- 連線房間資訊欄已縮窄，保留較大棋盤顯示空間

## 環境變數注意事項

- `client/.env` 只供本機使用
- 不要把 App Check debug token 放入公開站建置流程
- 正式站應使用：
  - `VITE_FIREBASE_APPCHECK_SITE_KEY`
- 本機管理頁不走 `client` bundle，而是由 `local-admin/` 另外讀取設定

## 目前限制

- 連線規則驗證仍以 client-side engine + transaction 為主
- 尚未完成完整斷線重連 / 身份 reclaim
- 尚未完成連線版規則回歸測試自動化
