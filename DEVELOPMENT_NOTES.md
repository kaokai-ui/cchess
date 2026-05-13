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
  - 管理監看頁
- 移除：
  - 前端對 Callable Functions 的呼叫
  - 透過網頁直接刪除房間 / 刪除用戶的功能
  - `firebase deploy` 內的 Functions 部署設定

### Spark 方案下的管理方式

- `/admin` 改為監看用途：
  - 查看目前房間
  - 查看目前連線用戶
  - 顯示對應的 Realtime Database 路徑
- 若需刪除資料，請直接在 Firebase Console 的 Realtime Database 手動刪除：
  - `rooms/{roomId}`
  - `roomPresence/{roomId}`
  - `userSessions/{uid}`

### 為何不保留前端刪除按鈕

- 在沒有 Cloud Functions 或其他受信任後端的前提下，無法安全驗證「管理者 debug token」
- 若把 token 驗證放在前端，實際上會把管理能力暴露到瀏覽器 bundle 內，不適合正式部署

---

## v0.6.0 Firebase 雙人連線版 (2026-05-13)

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
  - 房號 6 碼配對
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
- 新增 `/admin` 管理頁
- 可即時查看目前房間與目前連線用戶

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
