# 中國象棋 (CChess) 開發規劃

## 一、專案概述

基於 Vite + React + TypeScript 開發的中國象棋遊戲，支援明棋/暗棋模式、單人/雙人對戰，並可跨平台運行於 PC、iPad、Android Pad 及 Android TV。

---

## 二、需求清單

| # | 需求 | 說明 |
|---|------|------|
| 1 | 可選明棋、暗棋 | 遊戲開始前選擇棋類模式 |
| 2 | 明棋單機單人 | 明棋模式下的單人遊戲（人機對戰） |
| 3 | 明棋雙人連線 | 明棋模式下的雙人瀏覽器連線對戰 |
| 4 | 暗棋單機單人 | 暗棋模式下的單人遊戲（人機對戰） |
| 5 | 暗棋雙人連線 | 暗棋模式下的雙人瀏覽器連線對戰 |
| 6 | 暗棋規則設定 | 可切換暗棋特殊規則（如車吃子範圍） |
| 7 | 遊戲結束選項 | 繼續遊戲 / 離開遊戲 |
| 8 | 技術框架 | Vite + React + TypeScript |
| 9 | 雙人遊戲用瀏覽器玩 | Web 瀏覽器即可遊玩 |
| 10 | 可打包 APK | 單獨打包 APK 安裝至 10 吋/14 吋 Android Pad、65 吋 Android TV |
| 11 | AI 難易度 | 簡單 / 普通 / 困難 / 棋聖 |
| 12 | 大畫面設計 | 適合老人家使用的大字體、大按鈕、高對比介面 |

---

## 三、支援裝置與解析度

| 裝置 | 解析度 | 備註 |
|------|--------|------|
| PC | 1920x1080 及以上 | 瀏覽器運行 |
| iPad 10.6 吋 | 1640x2360 | Safari 瀏覽器 |
| 10 吋 Android Pad | 1920x1200 / 2560x1600 | 瀏覽器 / APK |
| 14 吋 Android Pad | 2000x1200 | 瀏覽器 / APK |
| 65 吋 Android TV | 3840x2160 (4K) | APK 運行，需支援遙控器導航 |

---

## 四、技術架構

### 4.1 前端技術棧

```
Vite + React 19 + TypeScript
├── UI Framework: TailwindCSS 4 (響應式設計)
├── State Management: Zustand 5
├── Routing: React Router 7
├── AI Engine: Minimax + Alpha-Beta + Quiescence Search + Iterative Deepening (單人模式)
├── Sound: Web Audio API (無外部音檔)
└── Packaging: Capacitor (APK 打包)
```

### 4.2 後端技術棧（連線對戰）

```
Node.js + Express + Socket.IO
├── 房間管理: 建立/加入/離開房間
├── 遊戲狀態同步: 即時傳送棋步
├── 配對系統: 隨機配對 / 房間碼配對
└── 部署: 可選 Firebase / 自建伺服器
```

---

## 五、專案目錄結構（實際）

```
CChess/
├── client/                    # 前端專案
│   ├── public/                # 靜態資源
│   ├── src/
│   │   ├── components/        # UI 元件
│   │   │   ├── BrightBoard.tsx    # 明棋棋盤
│   │   │   ├── BrightPiece.tsx    # 明棋棋子
│   │   │   ├── DarkBoard.tsx      # 暗棋棋盤
│   │   │   └── DarkPiece.tsx      # 暗棋棋子
│   │   ├── stores/            # Zustand 狀態管理
│   │   │   ├── brightGameStore.ts # 明棋遊戲狀態
│   │   │   ├── darkGameStore.ts   # 暗棋遊戲狀態
│   │   │   └── settingsStore.ts   # 設定狀態
│   │   ├── pages/             # 頁面
│   │   │   ├── Home.tsx       # 首頁
│   │   │   ├── BrightGame.tsx # 明棋遊戲頁
│   │   │   ├── DarkGame.tsx   # 暗棋遊戲頁
│   │   │   └── Settings.tsx   # 設定頁
│   │   ├── shared/            # 共用型別與遊戲邏輯
│   │   │   ├── types/             # TypeScript 型別定義
│   │   │   ├── bright-chess/      # 明棋引擎與 AI
│   │   │   │   ├── engine.ts      # 明棋規則
│   │   │   │   └── ai.ts          # 明棋 AI
│   │   │   └── dark-chess/        # 暗棋引擎與 AI
│   │   │       ├── engine.ts      # 暗棋規則
│   │   │       └── ai.ts          # 暗棋 AI
│   │   ├── utils/             # 工具函式
│   │   │   └── sound.ts       # Web Audio API 音效
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── android/                   # Capacitor Android 專案（待建立）
├── shared/                    # 前後端共用型別（規劃中）
├── DEVELOPMENT_PLAN.md        # 本文件
├── DEVELOPMENT_NOTES.md       # 開發筆記
├── RULES.md                   # 遊戲規則說明
├── TODO.md                    # 待辦清單
└── AGENTS.md                  # AI 助手指引
```

---

## 五點五、可直接借鏡麻將專案的經驗

這一段整理自先前開發過的麻將遊戲，目標不是複製麻將專案，而是把已經踩過的坑，直接轉成中國象棋專案一開始就應採用的規則。

### 5.5.1 專案結構要從第一天就分出「可發佈」與「本機專用」

- 需要上 GitHub、會進正式版 build 的內容，放在正式 source tree。
- 只供本機開發、管理、測試、暫存輸出、debug token、打包工具鏈的內容，集中放在 `local-admin/`。
- `local-admin/` 應預設視為不可發佈內容，不要讓本機設定、測試帳號、除錯輸出混進正式站。
- 建議中國象棋專案一開始就保留：
  - `local-admin/README.md`
  - `local-admin/DEVELOPMENT_NOTES.md`
  - `local-admin/scripts/`
  - `local-admin/runtime/`

### 5.5.2 正式設定與本機 override 一定要分離

- 麻將專案的經驗很明確：正式設定與本機 debug 設定如果混在一起，最容易在 Firebase / App Check / 發佈時出問題。
- 中國象棋如果走 Socket.IO + 自建 server，仍然應保留同樣原則：
  - 正式站設定放正式設定檔
  - 本機 server URL、測試金鑰、debug flag、mock backend 開關放本機 override
- 如果最後有 Firebase、OAuth、推播、analytics、App Check、或 TURN / STUN 設定，全部都應採用同樣分離方式。
- 不要把 debug token、測試帳密、內網 IP、臨時 server endpoint 直接寫進正式 source。

### 5.5.3 修改後的驗證順序要制度化，不要靠記憶

- 麻將專案後來最有價值的做法，不是某個功能，而是固定驗證順序：
  1. 先跑 source integrity check
  2. 再跑 smoke test
  3. 再跑功能或 layout regression
- 中國象棋專案也應在早期就建立：
  - integrity checker：檢查 UTF-8、引號、括號、template string、常見語法破損
  - smoke test：至少驗首頁可載入、可開始單機對局、可移動一手棋、可正常結束或回到主畫面
  - mode/regression script：明棋、暗棋、單人、雙人各自有最小驗證腳本
- 這樣之後就算重構 UI、AI 或連線層，也能快速知道是 build 壞了、流程壞了，還是 layout 壞了。

### 5.5.4 問題排查順序要先看啟動層，再看資料層，最後才看 UI

- 麻將專案有一個很關鍵的經驗：頁面沒動，不一定是連線或規則壞掉，很可能是 script 在 boot 階段就停住了。
- 中國象棋專案應建立固定排查順序：
  1. 頁面有沒有成功 boot
  2. 前端 state/store 有沒有初始化成功
  3. 單機邏輯或連線層有沒有 ready
  4. 資料是否正常同步
  5. 最後才檢查 UI 呈現
- 這可以大幅減少「其實是前端沒啟動，卻一直懷疑 backend」的時間浪費。

### 5.5.5 跨平台 layout 不要按裝置品牌硬分，要拆成結構、能力、狀態三層

- 麻將專案後期最成熟的經驗之一，是 layout 不再分成「iPad 版 / Android 版 / PC 版」，而是分三個維度：
  - 結構：2P / 4P 類型
  - 平台能力：fullscreen、viewport height、touch、D-pad、TV focus
  - 遊戲狀態：首頁、房間、對局中、結果畫面
- 中國象棋專案雖然不是 2P / 4P 麻將桌，但完全可以借鏡這個拆法：
  - 結構層：明棋棋盤、暗棋棋盤、首頁、房間面板、對局 HUD
  - 平台能力層：fullscreen、iPad viewport、高 DPI、大畫面模式、Android TV 遙控器焦點、觸控 vs 遙控器
  - 遊戲狀態層：首頁、規則設定、配對中、對局中、將軍/吃子提示、勝負結果
- 這樣修 Android TV focus 時，就不會順手打壞 iPad 觸控排版；修暗棋 HUD 時，也不會波及明棋棋盤。

### 5.5.6 CSS 與 UI ownership 要一開始就定義清楚

- 麻將專案最痛的問題之一，是早期 shared selector 太寬，修一個平台時常常波及其他平台。
- 中國象棋專案建議一開始就定義 ownership：
  - board structure 元件負責棋盤/格線/棋子位置
  - capability layer 負責 fullscreen、viewport、focus ring、TV navigation
  - page shell 負責首頁、設定頁、房間頁、結果頁
- CSS scope 建議至少分成：
  - shared base
  - bright-board scope
  - dark-board scope
  - game-focus / fullscreen scope
  - tv-focus / large-screen scope
- 不要在檔尾用一條超大 media query 硬蓋全部情境。

### 5.5.7 要先定義 viewport matrix，不要等 layout 壞了才補

- 麻將專案後來之所以比較穩，是因為 layout 檢查變成固定 matrix，而不是想到才測。
- 中國象棋專案也應在初期就固定最小 viewport matrix，例如：
  - PC desktop：`1920 x 1080`
  - iPad Safari：`1640 x 2360`
  - Android Pad 10 吋：`1920 x 1200`
  - Android Pad 14 吋：`2000 x 1200`
  - Android TV：`3840 x 2160`
- 每次 layout 變更至少驗：
  - 首頁
  - 模式選擇
  - 明棋對局中
  - 暗棋對局中
  - 結束彈窗
  - 如果有雙人連線，再加等待對手 / 房間資訊

### 5.5.8 Definition of Done 要包含功能、layout、打包，不只是「畫面看起來可以」

- 麻將專案後來把 DoD 寫清楚之後，迭代品質穩定很多。
- 中國象棋建議未來每次功能完成，都至少要滿足：
  - integrity checker pass
  - smoke test pass
  - 對應模式 regression pass
  - viewport matrix pass
  - 如果有 Android 打包需求，至少確認 build 成功且資產正確打包
- 對於大改 layout / cross-platform / APK / TV navigation 的工作，必須再加上 screenshot 或 artifact 證據。

### 5.5.9 Android / APK build 規則要先訂好，尤其是 CSS 打包與工具鏈

- 麻將專案已證明，Android APK 最容易出現「邏輯正常但畫面像純文字」這種其實是 CSS 沒被打包進去的問題。
- 中國象棋專案若要打包 APK，從一開始就應固定：
  - CSS 由 Vite module entry 載入，不靠 `index.html` 臨時抓 raw CSS
  - build 完要檢查 emitted CSS asset 是否真的存在
  - Android JDK / SDK 路徑要固定，不要依賴 PATH 上不確定版本
  - TV / Pad / browser 三條驗證路徑要分開看待

### 5.5.10 文件本身也是開發資產，要持續維護

- 麻將專案很大的收穫，是把踩坑歷史寫成可重用 playbook，而不是只留在對話或記憶裡。
- 中國象棋專案也應從第一天就維持：
  - `DEVELOPMENT_PLAN.md`：高層規劃
  - `DEVELOPMENT_NOTES.md`：踩坑、決策、規則澄清
  - 後續必要時再拆：
    - `LAYOUT_PLAYBOOK.md`
    - `LAYOUT_CHECKLIST.md`
    - `AI_TUNING_NOTES.md`
    - `NETWORK_PLAYBOOK.md`
- 對中國象棋這種同時有單機、AI、雙人、跨平台、TV 的專案來說，這些文件不是附加品，而是降低未來維護成本的核心工具。

---

## 五點六、建議沿用的整體架構模式

麻將專案後期最成功的重構方向，是把「遊戲規則 / 控制流程 / 畫面呈現 / 平台能力」分清楚。中國象棋建議直接採用同樣的分層，避免後面 UI、AI、連線彼此糾纏。

### 5.6.1 核心分層

1. **Pure game engine 層**
   - 不碰 DOM、不碰 React、不碰 WebSocket。
   - 只負責棋盤、走法、合法性、勝負判定、局面轉換。
   - 明棋與暗棋共用的型別、座標、棋子資料都放這一層。

2. **Controller / mode orchestration 層**
   - `solo-controller`：單機對戰流程、AI 回合、局面更新。
   - `network-controller`：雙人連線、房間、同步、斷線重連。
   - `mode-runtime`：切換單機 / 連線、明棋 / 暗棋。

3. **Bridge snapshot / presenter 層**
   - 把 engine state 轉成 React shell 好渲染的 snapshot。
   - 不要讓 component 直接讀 engine 原始資料結構。
   - 可把「棋盤畫面要顯示哪些高亮、可走點、提示文字、結果彈窗」集中在 presenter。

4. **React shell / UI 層**
   - 只負責 render、事件、動畫、focus、layout。
   - 不直接負責規則判定。

5. **Platform runtime 層**
   - fullscreen
   - viewport height
   - Android TV focus / D-pad
   - APK variant / packaging

### 5.6.2 建議的模組 ownership

- `shared/game-rules.ts`
  - 明棋 / 暗棋規則公開入口
- `shared/game-state/`
  - board state、move application、game result
- `shared/bright-chess/`
  - 明棋走法、將軍、將死、局面驗證
- `shared/dark-chess/`
  - 暗棋翻棋、階級、吃子、特殊規則
- `shared/ai/`
  - 評估、搜尋、難度策略
- `client/src/controllers/`
  - `solo-controller`
  - `network-controller`
- `client/src/bridge/`
  - snapshot selectors、presenters、view helpers
- `client/src/react-shell/`
  - `AppShell`
  - `GamePanel`
  - `RoomPanel`
  - `SettingsPanel`
- `client/src/runtime/`
  - bridge runtime、mode runtime、render runtime、platform runtime

### 5.6.3 重構原則

- 入口檔保持薄，內部細節拆到 support modules。
- 對外 API 儘量穩定，不要讓 UI 直接依賴深層模組。
- 任何會同時影響單機、連線、AI、畫面的邏輯，都優先拆成 pure helper，再由 controller 組裝。

---

## 五點七、建議從第一天就建立的本機工具與 scripts

麻將專案後期能加速重構，很大一部分是因為工具先建立好了。中國象棋應該在 Phase 0/1 就把這些腳手架補齊。

### 5.7.1 最小工具清單

- `local-admin/scripts/smoke-test.mjs`
  - 驗首頁、開局、走一步、狀態更新
- `local-admin/scripts/cchess-rules-regression.mjs`
  - 驗明棋走法、將軍、將死、不能照面
- `local-admin/scripts/dark-chess-regression.mjs`
  - 驗翻棋、吃子、特殊規則切換
- `local-admin/scripts/ai-deterministic-scenarios.mjs`
  - 驗 AI 在固定局面下輸出穩定
- `local-admin/scripts/network-controller-scenarios.mjs`
  - 驗建立房間、加入房間、走棋同步、重連
- `local-admin/scripts/layout-matrix.mjs`
  - 驗跨 viewport 與模式切換
- `local-admin/scripts/apk-build-check.mjs`
  - 驗 build 產物是否含正確 CSS/JS 資產

### 5.7.2 package.json 建議 scripts

```json
{
  "scripts": {
    "smoke": "node local-admin/scripts/smoke-test.mjs",
    "test:bright": "node local-admin/scripts/cchess-rules-regression.mjs",
    "test:dark": "node local-admin/scripts/dark-chess-regression.mjs",
    "test:ai": "node local-admin/scripts/ai-deterministic-scenarios.mjs",
    "test:network-controller": "node local-admin/scripts/network-controller-scenarios.mjs",
    "test:layout:matrix": "node local-admin/scripts/layout-matrix.mjs",
    "verify:plan": "node local-admin/scripts/verify-cchess-structure.mjs"
  }
}
```

### 5.7.3 文件與 log 規則

- 所有本機 log、artefact、screenshot、baseline 一律進 `local-admin/runtime/`
- 所有 debug playbook、測試規格、補充 checklist 一律進 `local-admin/`
- 不要把測試 artefact 直接散在 root、`client/`、`server/` 裡

---

## 五點八、最小 viewport / mode regression matrix

麻將專案證明，viewport matrix 要先訂，否則每次只會修眼前那台裝置。中國象棋建議最小 matrix 如下。

### 5.8.1 Viewport matrix

| 類型 | viewport | 用途 |
|------|----------|------|
| PC | `1920 x 1080` | Desktop 基準 |
| iPad portrait | `1640 x 2360` | Safari 直向 |
| iPad landscape | `2360 x 1640` | Safari 橫向 |
| Android Pad 10 | `1920 x 1200` | 平板基準 |
| Android Pad 14 | `2000 x 1200` | 大平板基準 |
| Android TV | `3840 x 2160` | TV / D-pad / overscan |

### 5.8.2 每個 viewport 至少驗的 mode

- 首頁
- 明棋單機
- 暗棋單機
- 明棋雙人連線房間頁
- 暗棋雙人連線房間頁
- 對局結束彈窗

### 5.8.3 每次至少要看的 invariant

- 棋盤完整可見，沒有被裁切
- 棋子、格線、座標字清楚可讀
- 已選棋子與可走點高亮明顯
- 結束彈窗不遮住必要按鈕
- 大字模式下按鈕仍可完整顯示
- Android TV 焦點框可見，且不會掉到不可見區
- fullscreen / game-focus 切換不會讓棋盤或控制列消失

---

## 五點九、平台與打包策略

### 5.9.1 建議的開發順序

1. 先把 browser 版本做穩
2. 再處理 iPad Safari
3. 再處理 Android Pad browser
4. 再做 APK
5. 最後才做 Android TV 導航最佳化

### 5.9.2 Android TV 不要太晚才想起來

- 雖然 TV 可排在 APK 後面，但焦點模型不能完全等最後才做。
- 建議從早期就讓互動元件帶可聚焦語意，避免最後整個 UI 重寫。

### 5.9.3 APK 打包固定規則

- CSS 必須從 module entry 匯入
- build 後一定檢查 emitted CSS asset
- JDK / SDK / signing 步驟寫成固定腳本
- 不要只用瀏覽器成功當成 APK 成功

---

## 六、遊戲模式設計

### 6.1 明棋模式

```
標準中國象棋規則:
├── 棋盤: 9x10 交叉點
├── 棋子: 將/帥、士/仕、象/相、馬/傌、車/俥、砲/炮、兵/卒
├── 勝利條件: 將死對方將/帥
├── 特殊規則:
│   ├── 將帥不能照面
│   ├── 過河前兵/卒只能前進
│   └── 象/相不能過河
└── AI 難度: 簡單 / 普通 / 困難 / 棋聖
```

### 6.2 暗棋模式

```
半棋規則 (翻棋):
├── 棋盤: 4x8 格子
├── 棋子: 將x1、帥x1、士x2、象x2、馬x2、車x2、砲x2、兵x5 (共32顆)
├── 初始狀態: 所有棋子蓋著，隨機排列
├── 遊戲流程:
│   ├── 翻棋: 翻開一顆未知棋子
│   ├── 移動: 移動己方已翻開的棋子
│   └── 吃子: 吃對方棋子或同色較低階棋子
├── 階級: 將 > 士 > 象 > 馬 > 車 > 兵 > 將 (兵可吃將)
├── 特殊規則 (可設定切換):
│   ├── 車吃子範圍: 僅相鄰 / 直線全範圍
│   ├── 砲吃子規則: 需隔一顆棋子 / 可直接吃
│   └── 兵吃將: 允許 / 不允許
└── 勝利條件: 吃掉對方所有棋子或對方無子可動
```

---

## 七、開發階段規劃

### Phase 0: 開工前治理 (Week 0-1)

- [ ] 建立 `local-admin/` 結構與 `.gitignore` 規則
- [ ] 建立 `DEVELOPMENT_NOTES.md`
- [ ] 建立 integrity checker / smoke test 腳手架
- [ ] 建立最小 layout matrix 腳手架
- [ ] 建立 browser / APK / TV 的驗證 checklist
- [ ] 定義 public entrypoint + support module 的重構慣例

### Phase 1: 基礎架構 (Week 1-2)

- [ ] 初始化 Vite + React + TypeScript 專案
- [ ] 設定 TailwindCSS 響應式設計
- [ ] 建立專案目錄結構
- [ ] 定義 TypeScript 型別（棋子、棋盤、遊戲狀態）
- [ ] 建立 `shared/` pure game engine 邊界
- [ ] 建立 `bridge/` snapshot + presenter 邊界
- [ ] 建立 `react-shell/` page shell / board shell / settings shell
- [ ] 實作棋盤渲染元件
- [ ] 實作棋子渲染元件

### Phase 2: 明棋核心邏輯 (Week 3-4)

- [x] 實作明棋規則驗證
- [x] 實作各棋子移動規則
- [x] 實作將軍檢測
- [x] 實作將死檢測
- [x] 實作棋步歷史記錄
- [x] 實作悔棋功能
- [ ] 建立明棋 rules regression 測試
- [ ] 建立最小 deterministic fixture

### Phase 3: 暗棋核心邏輯 (Week 5-6)

- [x] 實作暗棋棋盤 (4x8)
- [x] 實作翻棋機制
- [x] 實作暗棋階級系統
- [x] 實作暗棋吃子規則
- [x] 實作暗棋規則設定切換
- [x] 實作暗棋勝利條件
- [ ] 建立暗棋 rules regression 測試
- [x] 驗特殊規則切換不影響明棋模式

### Phase 4: AI 引擎 (Week 7-8)

- [x] 實作 Minimax 演算法
- [x] 實作 Alpha-Beta 剪枝
- [x] 實作棋局評估函數（PST + 機動性 + 將軍偵測）
- [x] 實作四難度等級 (簡單/普通/困難/棋聖)
- [x] 實作靜態搜尋（Quiescence Search）
- [x] 實作迭代加深（Iterative Deepening）
- [ ] 測試與調校 AI 強度
- [ ] 建立 AI deterministic scenarios
- [ ] 把 AI engine 放到 pure logic / worker-friendly 結構
- [ ] 實作殺手啟發（Killer Moves）
- [ ] 實作歷史啟發（History Heuristic）
- [ ] 實作置換表（Transposition Table）

### Phase 5: UI/UX 完善 (Week 9-10)

- [x] 首頁選單設計
- [x] 遊戲模式選擇介面
- [x] 設定頁面（暗棋規則、大字體、音效）
- [x] 遊戲結束彈窗（繼續/離開）
- [ ] 動畫效果（移動、吃子、翻棋）
- [x] 音效系統（Web Audio API）
- [x] 響應式佈局適配各裝置
- [x] 長者友善大畫面模式（大字體、大按鈕、高對比）
- [ ] 建立 browser viewport matrix
- [ ] 建立 game state × platform capability layout checklist
- [ ] 將軍提示（Check indicator）

### Phase 6: 連線對戰 (Week 11-12)

- [ ] 搭建 Socket.IO 伺服器
- [ ] 實作房間系統
- [ ] 實作遊戲狀態同步
- [ ] 實作斷線重連機制
- [ ] 前端連線 UI
- [ ] 測試多人對戰
- [ ] 建立 network controller scenarios
- [ ] 規劃 reconnect / room expiration / identity reclaim 流程

### Phase 7: 跨平台打包 (Week 13-14)

- [ ] 整合 Capacitor
- [ ] 設定 Android 專案
- [ ] 適配 Android TV 遙控器導航
- [ ] 產生 APK
- [ ] 測試各裝置相容性
- [ ] 效能優化
- [ ] 驗 emitted CSS / JS assets
- [ ] 驗 Android TV D-pad navigation
- [ ] 驗 fullscreen / viewport / overscan 行為

### Phase 8: 測試與發布 (Week 15-16)

- [ ] 單元測試
- [ ] 整合測試
- [ ] 跨裝置測試
- [ ] Bug 修復
- [ ] 效能優化
- [ ] 發布準備
- [ ] 文件收斂：notes / checklist / build playbook

### 7.9 每個 phase 的最低驗收條件

| Phase | 最低驗收條件 |
|------|--------------|
| Phase 0 | integrity checker 可跑、smoke test 可跑、`local-admin/` 結構固定 |
| Phase 1 | 首頁與空棋盤可穩定載入；typecheck pass |
| Phase 2 | 明棋核心規則回歸 pass |
| Phase 3 | 暗棋核心規則回歸 pass |
| Phase 4 | AI deterministic scenarios pass |
| Phase 5 | layout matrix pass；大字模式可用 |
| Phase 6 | network controller scenarios pass；雙 client 可正常完成一局 |
| Phase 7 | browser 與 APK 行為一致；TV 焦點可操作 |
| Phase 8 | smoke / rules / AI / network / layout 全部 pass，文件更新完成 |

---

## 八、關鍵技術實作細節

### 8.1 響應式設計策略

```typescript
// 使用 CSS Media Queries + Tailwind 斷點
// 棋盤大小根據裝置動態調整
const boardSize = {
  pc: 'min(80vw, 60vh)',
  ipad: 'min(85vw, 70vh)',
  androidPad10: 'min(85vw, 70vh)',
  androidPad14: 'min(80vw, 65vh)',
  androidTV: 'min(70vw, 60vh)',
};
```

### 8.2 遊戲狀態管理 (Zustand)

```typescript
type AIDifficulty = 'easy' | 'normal' | 'hard' | 'master';

interface BrightGameState {
  board: Piece[][];
  currentPlayer: 'red' | 'black';
  playerColor: 'red' | 'black';
  selectedCell: Position | null;
  validMoves: Position[];
  phase: 'playing' | 'gameOver';
  winner: 'red' | 'black' | null;
  lastMove: { from: Position; to: Position } | null;
  aiDifficulty: AIDifficulty;
  isAiThinking: boolean;
  message: string;
  history: MoveRecord[];
  historyIndex: number;
}

interface DarkGameState {
  board: Piece[][];
  currentPlayer: 'red' | 'black';
  playerColor: 'red' | 'black' | null;
  aiColor: 'red' | 'black' | null;
  isFlippingFirst: boolean;
  selectedCell: Position | null;
  validMoves: Position[];
  phase: 'playing' | 'gameOver';
  winner: 'red' | 'black' | null;
  lastMove: { from: Position; to: Position } | null;
  aiDifficulty: AIDifficulty;
  isAiThinking: boolean;
  message: string;
  history: MoveRecord[];
  historyIndex: number;
}
```

### 8.3 明棋 AI 引擎

```typescript
// 搜尋策略
- Minimax + Alpha-Beta 剪枝
- Quiescence Search（靜態搜尋，避免水平線效應）
- Iterative Deepening（迭代加深，動態調整深度）
- Move Ordering（吃子優先排序）

// 評估函數
- 棋子基礎價值
- 位置表（PST）：7 種棋子各有 10x9 位置價值
- 機動性（Mobility）：可走步數差 × 2
- 將軍偵測：將軍對手 +30，被將軍 -30

// 難度設定
const difficultyConfig = {
  normal: { maxDepth: 3, maxTime: 10000, maxNodes: 200000 },
  hard:   { maxDepth: 4, maxTime: 20000, maxNodes: 300000 },
  master: { maxDepth: 6, maxTime: 30000, maxNodes: 400000 },
};
```

### 8.3 WebSocket 通訊協定（規劃中）

```typescript
// 事件定義
enum SocketEvents {
  CREATE_ROOM = 'create_room',
  JOIN_ROOM = 'join_room',
  MAKE_MOVE = 'make_move',
  GAME_STATE = 'game_state',
  OPPONENT_DISCONNECTED = 'opponent_disconnected',
  // ...
}
```

### 8.4 暗棋規則設定

```typescript
interface DarkChessSettings {
  rookCaptureRange: 'adjacent' | 'fullLine';  // 車吃子範圍
  cannonCaptureRule: 'needJump' | 'direct';     // 砲吃子規則
  soldierKillGeneral: boolean;                   // 兵能否吃將
}
```

### 8.5 音效系統（Web Audio API）

```typescript
// 音效類型
- playMoveSound(): 移動音效（400Hz 正弦波）
- playCaptureSound(): 吃子音效（200Hz 方波）
- playFlipSound(): 翻棋音效（600Hz 三角波）
- playCheckSound(): 將軍音效（800Hz 鋸齒波）
- playWinSound(): 勝利音效（上行音階）
- playLoseSound(): 失敗音效（下行音階）

// 開關控制
- 透過 settingsStore.ui.soundEnabled 控制
- 關閉時 playTone 直接返回
```

### 8.6 建議的 state / controller 形狀

```typescript
type GameVariant = 'bright' | 'dark';
type PlayMode = 'solo' | 'online';

interface AppState {
  variant: GameVariant;
  playMode: PlayMode;
  room: RoomSnapshot | null;
  message: string;
  error: string;
  selectedAIDifficulty: AIDifficulty;
  selectedDarkChessSettings: DarkChessSettings;
  selectedLargeUI: boolean;
}

interface ControllerLike {
  init(): Promise<void>;
  leaveRoom(): void;
  sendGameCommand(command: string, payload?: unknown): Promise<void>;
  getIdentity(): { playerId: string; playerName?: string };
}
```

### 8.7 建議的 bridge snapshot 原則

- React component 不直接吃 engine 原始 state。
- 所有畫面呈現資料先經過 presenter：
  - board snapshot
  - action snapshot
  - room snapshot
  - result modal snapshot
- 這樣未來 UI 重做、TV 版 layout、或大字模式調整時，不需要碰核心規則。

### 8.8 Android TV 焦點模型建議

- 棋盤格可聚焦，但不要讓 90 個交叉點都成為預設焦點陷阱。
- 建議用「棋盤區 + 功能列 + 設定面板」三塊 focus group。
- 重要按鈕要有明顯 focus ring、放大、陰影或反白。
- 對局中若用遙控器移動焦點，需有明確「目前選中棋子 / 目前選中目標格」狀態。

---

## 九、Android TV 特別注意事項

1. **遙控器導航**: 所有互動元素需支援 D-Pad 導航
2. **焦點管理**: 使用 `@react-native-tv/tv` 或自訂焦點系統
3. **文字大小**: 確保 4K 解析度下文字可讀
4. **安全區域**: 考慮 TV 過掃描 (overscan) 問題
5. **橫向佈局**: TV 預設橫向顯示

---

## 十、長者友善大畫面設計

### 10.1 設計原則

1. **大按鈕**: 所有可點擊元素最小尺寸 48x48dp，建議 64x64dp 以上
2. **大字體**: 預設字體大小 20px 以上，可切換至 24px/28px
3. **高對比**: 文字與背景對比度至少 4.5:1，建議 7:1 以上
4. **簡化操作**: 減少手勢操作，以點擊為主，避免滑動/長按
5. **清晰回饋**: 操作後有明確視覺/音效回饋

### 10.2 視覺設計

```
大畫面模式設定:
├── 棋子大小: 預設 x1.2 / 大 x1.5 / 特大 x1.8
├── 棋盤格線: 加粗 2px / 3px
├── 按鈕尺寸: 標準 48px / 大 64px / 特大 80px
├── 字體大小: 標準 20px / 大 24px / 特大 28px
├── 顏色對比:
│   ├── 紅棋: #D32F2F (深紅)
│   ├── 黑棋: #212121 (深黑)
│   ├── 棋盤: #FFF8E1 (暖白)
│   └── 格線: #5D4037 (深棕)
└── 動畫速度: 放慢 1.5x (讓長者清楚看到變化)
```

### 10.3 操作優化

1. **防誤觸**: 點擊後 500ms 冷卻時間
2. **確認機制**: 重要操作（離開遊戲、認輸）需二次確認
3. **提示功能**: 可選顯示可移動位置提示
4. **語音提示**: 可選開啟走棋語音播報
5. **一鍵回到主選單**: 隨時可快速離開

---

## 十一、效能優化建議

1. **棋盤渲染**: 使用 Canvas 或 WebGL 渲染大量棋子動畫
2. **AI 計算**: Web Worker 執行 AI 避免阻塞 UI
3. **資源載入**: 圖片使用 WebP 格式，延遲載入非關鍵資源
4. **快取策略**: 使用 Service Worker 快取靜態資源
5. **記憶體管理**: 及時清理未使用的遊戲狀態

---

## 十一點五、固定開發流程與排查順序

### 11.5.1 每次改動後的固定流程

1. 跑 integrity checker
2. 跑 smoke test
3. 跑對應 regression
4. 如果有 layout 變更，跑 layout matrix
5. 如果有 APK 影響，跑 build / asset check

### 11.5.2 排查順序

1. 先看 boot 是否成功
2. 再看 controller / store 是否 ready
3. 再看規則或同步資料是否正確
4. 最後才看畫面

### 11.5.3 不要忽略的兩類風險

- **編碼 / 引號 / template string 壞掉**
  - 這種問題常常讓整頁 boot 失敗，表面看起來像 UI 或連線問題
- **平台能力差異**
  - iPad Safari viewport
  - Android fullscreen
  - TV focus
  - APK 資產打包

---

## 十一點六、建議的 Definition of Done

任何一個可宣告完成的功能，至少要滿足以下條件：

- 功能本身可操作
- 不破壞其他模式
- smoke test pass
- 對應 regression pass
- 如涉及 layout，viewport matrix pass
- 如涉及 APK / TV，對應裝置驗證完成
- 文件已更新到 `DEVELOPMENT_NOTES.md` 或對應 playbook

如果是大改動，還應補：

- screenshot / artifact 證據
- 已知限制
- 下一步風險與建議

---

## 十二、後續擴充可能性

- [ ] 線上排行榜
- [ ] 成就系統
- [ ] 棋譜記錄與覆盤
- [ ] 自訂棋盤/棋子主題
- [ ] 語音聊天（連線模式）
- [ ] 觀戰模式
- [ ] 殘局挑戰模式

---

## 十三、開發工具推薦

| 用途 | 工具 |
|------|------|
| 程式碼編輯器 | VS Code |
| 版本控制 | Git + GitHub |
| 設計工具 | Figma |
| API 測試 | Postman |
| 效能分析 | Chrome DevTools |
| 自動化測試 | Vitest + React Testing Library |
| CI/CD | GitHub Actions |

---

*此文件為開發規劃藍圖，可依實際開發進度調整。*
