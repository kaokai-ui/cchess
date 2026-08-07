# 暗棋規則說明 (Dark Chess Rules)

## 1. 基本玩法

- 棋盤為 `4 x 8`，共 `32` 顆棋子。
- 開局時全部棋子皆為蓋著的暗棋，位置隨機。
- 先翻開第一顆棋子的一方，取得該顆棋子的顏色；另一方取得另一個顏色。
- 之後雙方輪流進行一個動作：`翻棋`、`移動` 或 `吃子`。

## 2. 棋子與階級

每方共有 `16` 顆棋子：

| 棋子 | 數量 | 階級 |
|---|---:|---:|
| 將 / 帥 | 1 | 7 |
| 士 / 仕 | 2 | 6 |
| 象 / 相 | 2 | 5 |
| 車 / 俥 | 2 | 4 |
| 馬 / 傌 | 2 | 3 |
| 砲 / 炮 | 2 | 2 |
| 卒 / 兵 | 5 | 1 |

## 3. 翻棋

- 回合中可以選擇翻開一顆尚未翻開的暗棋。
- 翻開後該顆棋子變為明棋，並立即結束本回合。

## 4. 移動與吃子

### 4.1 一般棋子

- 一般棋子只能上下左右移動一格。
- 若目標格是空格，則為移動。
- 若目標格有敵方明棋，且階級規則允許，則可吃子。

### 4.2 階級規則

- 一般情況下，大階級可以吃小階級或同階級。
- `兵 / 卒` 可以吃 `將 / 帥`。
- `將 / 帥` 不能吃 `兵 / 卒`。

### 4.3 砲

- 砲的移動規則與一般棋子相同：空格時只走一格。
- 砲吃子時依設定決定規則：
  - `needJump`：中間必須剛好隔一顆棋子。
  - `direct`：可直接直線吃子，不需隔子。

### 4.4 車

- 車吃子時依設定決定規則：
  - `adjacent`：只可吃相鄰一格。
  - `fullLine`：只要路徑無阻擋，可沿直線吃子。

### 4.5 規則設定套用範圍

- 上述「砲吃子」與「車吃子」等設定，於**單機**與**連線**模式皆會套用。
  - 單機：依設定頁（Settings）選項。
  - 連線：依房主開房時鎖定的設定，整局固定。

## 5. 勝負

- 一方所有可用棋子都被吃光，且已無未翻開暗棋時，另一方獲勝。
- 若局面達到雙方都無法再進行有效對局，則為平手。

## 6. AI 難度

| 難度 | 搜尋深度 | 說明 |
|---|---:|---|
| `easy` | 隨機 | 主要用於體驗與測試 |
| `normal` | 3 | 基本 Minimax 搜索 |
| `hard` | 4 | 單機預設難度 |
| `master` | 5 | 更深層搜索與更強判斷 |

### 6.1 五子棋 AI 難度

五子棋有自己的一套 AI，與明棋／暗棋不共用。前四級沿用棋型評分啟發式，後三級改用
Alpha-Beta 搜尋引擎（置換表 + 殺手著法 + 歷史啟發），並在背景執行緒（Web Worker）思考。
引擎設計、實測數據與已知限制詳見 `GOMOKU_AI.md`。

| 難度 | 引擎 | 深度上限 | 思考時間 | 說明 |
|---|---|---:|---:|---|
| `easy` / `normal` / `hard` / `master` | 棋型啟發式 | — | 即時 | `master` = 棋聖，單層評分加淺層預判 |
| `god`（棋神） | Alpha-Beta + VCF | 8 | 350ms | 會算穿「連續衝四」殺棋，攻守皆算 |
| `tianyuan`（天元） | Alpha-Beta + VCF + VCT | 12 | 900ms | 再加上「活三連環殺」求解與開局定式 |
| `wuji`（無極） | 同上 + 多執行緒分工 | 16 | 2000ms | 核心夠時，深度搜尋與 VCF／VCT 分別在不同 worker 同時進行 |

- 三個搜尋難度都以「時間預算 + 節點上限 + 迭代加深」為界：慢裝置只會搜得較淺，不會卡住畫面。
- 低核心數裝置（`hardwareConcurrency <= 4`）會自動下修時間與節點預算；核心不足時，無極會退回
  單一 worker 的循序流程。
- 棋神／天元／無極只在五子棋出現，主選單切換到明棋或暗棋時會自動改用 `master`。
- 規則為無禁手自由五子棋，黑先理論佔優；單機模式玩家固定執黑，AI 執白。

## 7. 單機 AI 補充規則

- 單機模式的明棋與暗棋，AI 預設難度為 `hard`。
- 暗棋 AI 會優先處理已知資訊下的吃子與走子，不會把翻牌結果直接當成可預知資訊來搜索。
- 暗棋 AI 在殘局中，若已符合「幾乎無法翻盤」條件，會主動認輸。

### 7.1 AI 主動認輸條件

AI 只會在下列條件同時成立時主動認輸：

- 棋盤上已沒有未翻開的暗棋。
- AI 只剩少數棋子。
- AI 目前沒有任何可吃子的步。
- 依照現存棋型與規則，AI 已無法再吃掉對手剩餘的關鍵棋子（判斷時會考慮砲的吃子規則：在 `needJump` 下，若盤面已無可借用的砲架，孤砲視為無法吃子）。

## 8. Solo Dark Chess Accessibility Timing

- The solo Dark Chess setting `AI 翻牌速度 = 長輩更慢` means the flip animation itself lasts longer.
- Current pacing:
  - `標準慢`: flip cue animation plays for about `700ms`
  - `長輩更慢`: flip cue animation plays for about `2000ms`
- This setting does not add an extra pre-flip wait of `2000ms`.

## 9. Captured Pieces Display

- In both solo Dark Chess and online Dark Chess, captured pieces are shown beside the board.
- The left tray shows captured black pieces.
- The right tray shows captured red pieces.
- The trays are derived from the remaining pieces on the board, so they stay in sync with the current game state.
