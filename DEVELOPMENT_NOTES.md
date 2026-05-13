# 開發筆記 (DEVELOPMENT_NOTES.md)

## 連線部署

- 使用 **Firebase** 作為連線對戰的後端部署平台
- Firebase 提供即時資料庫 (Realtime Database / Firestore) 與身份驗證服務，適合雙人連線對戰的即時同步需求

## 雙人連線模式

- 需要依賴 **Firebase** 服務
- 使用 **房號系統** 讓玩家建立或加入房間進行對戰
- 啟用 **Firebase App Check** 確保應用程式安全性，防止未授權的存取

## 單人模式

- **不需要** Firebase 服務
- **不需要** 房號系統
- **不需要** App Check
- 所有遊戲邏輯與 AI 運算均在本地端執行，無需網路連線

---

## v0.6.3 目前狀態整理版 (2026-05-13)

### 目前已完成

- 雙人連線明棋 / 暗棋都已可在 Firebase Spark 方案下運作
- 匿名登入、Realtime Database 房間同步、App Check 已整合
- 房號改為 **5 碼純數字**
- 對局結束後可選擇：
  - 繼續遊戲
  - 返回主選單
- 明棋 / 暗棋的連線房間版面已調整為：
  - 左側資訊欄較窄
  - 棋盤顯示區更大
- 明棋連線視角已依玩家身份翻轉：
  - 紅方看到紅方在下
  - 黑方看到黑方在下
- 公開 GitHub Pages 站台已移除 `/admin`
- 管理工具改為 **本機專用** `local-admin/`

### 管理工具現況

- 管理介面只在本機使用：
  - `http://127.0.0.1:5179/admin`
- `local-admin/` 會讀取：
  - `client/.env`
  - `local-admin/appcheck-debug-token.json`
- 管理頁不再輸入 debug token
- App Check debug token 由 Firebase SDK 真正的 debug provider 使用
- 管理刪除權限改由 Realtime Database 規則控制：
  - `admins/{uid} = true`

### 目前要特別注意

- **公開站沒有管理介面**，GitHub Pages 上不應再期待 `/admin`
- `local-admin/` 已在 `.gitignore` 中排除，不會上傳 GitHub
- `local-admin/appcheck-debug-token.json` 屬於本機敏感資料，應只保留在管理機器上
- 連線規則驗證目前仍以 Realtime Database transaction + client-side engine 為主
- 若未來要進一步強化作弊防護，仍需要重新評估受信任後端方案

### 本機管理頁操作摘要

1. 啟動：
   - `node local-admin/server.mjs`
2. 開啟：
   - `http://127.0.0.1:5179/admin`
3. App Check：
   - 在 Firebase Console 的 App Check 為 Web App 註冊 debug token
4. 管理權限：
   - 在 Realtime Database 設定 `admins/{uid} = true`

### 目前驗證過的項目

- `client`：
  - `npm run lint`
  - `npm run build`
- `functions`：
  - `npm run build`
- Firebase：
  - Realtime Database rules deploy 成功
- GitHub Pages：
  - 自動部署正常

---

## v0.6.1 Firebase Spark 方案調整版 (2026-05-13)

### 調整目標

- 改為符合 Firebase Spark 免費方案可部署的結構
- 移除前端對 Cloud Functions 的依賴，避免必須升級 Blaze

### 調整內容

- 保留：
  - Firebase Anonymous Auth
  - Firebase App Check
  - Realtime Database 房間同步
  - 雙人明棋 / 暗棋
  - 本機管理工具 (`local-admin/`)
- 移除：
  - 前端對 Callable Functions 的呼叫
  - 公開站上的 `/admin` 管理入口
  - `firebase deploy` 內的 Functions 部署設定

### Spark 方案下的管理方式

- 使用本機管理頁：
  - `node local-admin/server.mjs`
  - `http://127.0.0.1:5179/admin`
- 管理頁可：
  - 查看目前房間
  - 查看目前連線用戶
  - 刪除房間
  - 刪除用戶
  - 一鍵刪除所有房間
- 刪除權限需依賴：
  - App Check debug token
  - `admins/{uid} = true`

### 為何不保留公開站前端刪除按鈕

- 公開站若保留管理刪除功能，會把管理邏輯暴露到正式 bundle
- 因此管理介面移到 `local-admin/`，只在本機端開啟
- 本機仍使用 Firebase SDK + Database Rules 控制權限，不再經由網頁手動輸入 token

---

## v0.6.0 Firebase 雙人連線版 (2026-05-13)

> 以下為當時版本的階段性紀錄。若與目前行為衝突，請以 `v0.6.3 目前狀態整理版` 為準。

### 已新增功能

#### Firebase 連線層
- Web 端 Firebase 初始化與環境變數範例 (`client/.env.example`)
- Firebase Anonymous Auth 匿名登入
- Firebase App Check 初始化
  - 正式站使用 `VITE_FIREBASE_APPCHECK_SITE_KEY`
  - 本機可用 `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`
- Realtime Database 房間同步
  - 建立房間
  - 加入房間
  - 離開房間
  - 房號配對（目前正式版本已調整為 5 碼純數字）
  - 房間 presence / user session 同步

#### 雙人明棋
- 新增雙人連線大廳
- 新增雙人明棋房間頁
- 房主固定紅方、客方固定黑方
- 使用 Realtime Database transaction 驗證並同步走棋
- 對手離線或離房時，房間會標記為 `abandoned`

#### 雙人暗棋
- 新增雙人暗棋房間頁
- 第一手翻棋決定顏色，並同步到雙方畫面
- 使用目前房間的暗棋規則設定建立連線對局
- 使用 Realtime Database transaction 驗證翻棋與移動
- 修正暗棋規則設定真正進入引擎：
  - 車吃子範圍：相鄰 / 直線全範圍
  - 砲吃子規則：需翻山 / 可直接吃
  - 兵吃將：允許 / 不允許

#### 管理介面
- 初期曾新增公開 `/admin` 管理頁
- 後續已改為本機 `local-admin/` 管理工具

#### Firebase 專案檔
- `firebase.json`
- `database.rules.json`

### 已知限制

- Realtime Database 規則目前以「已登入匿名用戶可讀、房間成員可寫」為主，合法走法驗證主要由 client-side transaction 保證
- 本地 in-app browser 對 `localhost` 驗證曾遇到 `ERR_BLOCKED_BY_CLIENT`，本次以 build/lint 與本機 HTTP 200 驗證為主
- 目前未額外實作同房重賽流程；對局結束後建議離房重開

---

## v0.5.0 明棋+暗棋單機版 (2026-05-11)

### 已實作功能

#### 暗棋 (Dark Chess)
- 4x8 棋盤，32 顆棋子隨機排列
- 翻棋機制（第一手翻開決定顏色）
- 完整階級系統：將 > 士 > 象 > 車 > 馬 > 砲 > 兵
- 特殊規則（可設定切換）：
  - 兵可吃將，將不可吃兵（可關閉）
  - 砲翻山吃子（需隔一顆棋子，可切換為直接吃）
  - 車吃子範圍（相鄰/直線全範圍）
  - 同級棋子可互吃
- AI 對手（Minimax + Alpha-Beta 剪枝）
- 四種 AI 難度：簡單(隨機)、普通(Depth 3)、困難(Depth 4)、棋聖(Depth 5)
- 遊戲結束彈窗（繼續遊戲 / 離開遊戲）

#### 明棋 (Bright Chess)
- 9x10 棋盤（交叉點），SVG 繪製格線、楚河漢界、九宮格
- 標準中國象棋初始佈局
- 完整棋子移動規則：
  - 將/帥：九宮格內上下左右一格
  - 士/仕：九宮格內斜走一格
  - 象/相：斜走兩格，不可過河，塞象眼
  - 馬/傌：日字步，蹩馬腿
  - 車/俥：直線滑行
  - 砲/炮：直線移動，吃子需翻山
  - 兵/卒：過河前只能前進，過河後可左右
- 特殊規則：
  - 將帥不能照面（飛將）
  - 將軍/將死檢測
- AI 對手（Minimax + Alpha-Beta 剪枝 + 靜態搜尋 + 迭代加深）
- 四種 AI 難度：簡單(隨機)、普通(Depth 3/10s/200k)、困難(Depth 4/20s/300k)、棋聖(Depth 6/30s/400k)
- AI 評估函數：棋子價值 + 位置表(PST) + 機動性 + 將軍偵測
- 每種難度有獨立時間與節點限制，超時或超節點立即停止

#### UI/UX
- 首頁可選擇明棋/暗棋模式與 AI 難度
- 暗棋翻牌決定顏色（無預設顏色選擇）
- 明棋固定紅方先行
- 響應式設計支援多裝置（`h-screen overflow-hidden` flexbox 布局）
- 長者友善設計：大字體 (18-32px)、大按鈕、高對比配色
- 木紋風格棋盤與圓形棋子
- 選取/可移動/最後一步高亮提示
- 遊戲結束彈窗（繼續/離開）
- 音效系統（Web Audio API）：移動、吃子、翻棋、勝負音效，可於設定頁開關
- 悔棋功能（Undo）：支援回到上一步，AI 回合自動觸發 AI 回應
- 設定頁面（Settings Page）：
  - 暗棋規則設定（車吃子範圍、砲吃子規則、兵吃將）
  - 大字體模式開關
  - 音效開關

### 技術架構

- Vite + React 19 + TypeScript
- Zustand 5 狀態管理
- React Router 7 路由
- TailwindCSS 4 樣式
- Pure game engine 與 UI 分離
- AI 在 main thread 執行（有超時與節點保護）
- Web Audio API 音效（無外部音檔）

### 已知問題

- AI 在 main thread 執行，棋聖難度可能仍有短暫延遲（已有超時保護）
- 無棋譜記錄
- 無將軍提示（Check indicator）
- 無動畫效果（移動、吃子、翻棋）

### 開發命令

```bash
cd client && npm run dev      # 開發伺服器
cd client && npm run build    # 生產建構
cd client && npx tsc --noEmit # 型別檢查
```
