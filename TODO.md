# 未實作功能清單

根據 `local-admin/DEVELOPMENT_PLAN.md` 規劃，以下功能尚未實作：

## Phase 6: 連線對戰

- [x] Firebase 後端整合
- [x] 房間系統（建立/加入/離開房間）
- [x] 房號配對機制
- [x] Firebase App Check 安全驗證
- [x] 遊戲狀態即時同步（Realtime Database）
- [x] 基礎斷線處理（presence / abandoned 狀態）
- [x] 前端連線 UI（等待對手、房間資訊）
- [x] 雙人明棋連線對戰
- [x] 雙人暗棋連線對戰
- [x] 本機管理工具（監看房間 / 連線用戶 / 刪除）
- [x] Spark 方案下的本機管理 SOP 文件
- [x] 完整斷線重連與身份 reclaim 流程
- [ ] 雙人重賽流程
- [ ] 連線明棋視角翻轉的回歸測試
- [ ] 連線版不同螢幕尺寸的 layout regression 驗證

## Phase 7: 跨平台打包

- [ ] Capacitor 整合
- [ ] Android 專案設定
- [ ] Android TV 遙控器導航（D-Pad）
- [ ] 焦點管理（Focus Ring）
- [ ] APK 打包流程
- [ ] 過掃描 (overscan) 適配
- [ ] APK 資產檢查腳本

## Phase 5: UI/UX 完善（部分）

- [ ] 動畫效果優化
  - [ ] 棋子移動動畫
  - [ ] 吃子動畫
  - [ ] 翻棋動畫
- [ ] 將軍提示（Check indicator）
- [ ] 動畫速度調整

## Phase 2: 明棋核心邏輯（部分）

- [ ] 棋譜記錄與覆盤
- [ ] 明棋規則回歸測試

## Phase 4: AI 引擎（部分）

- [x] Web Worker 執行 AI（避免 UI 阻塞）— 明棋 AI 已移至 Worker（B6），已實機驗證
- [x] AI 確定性（B13：移除 `Date.now()` 牆鐘截斷，改以節點數上限；離線驗證同盤面結果一致）
- [ ] AI 確定性回歸測試腳本（常駐）
- [ ] 殺手啟發（Killer Moves）— 明棋尚未做；五子棋已完成
- [ ] 歷史啟發（History Heuristic）— 明棋尚未做；五子棋已完成
- [ ] 置換表（Transposition Table / Zobrist Hashing）— 明棋尚未做；五子棋已完成

### 五子棋 AI 強化（已完成，詳見 `GOMOKU_AI.md`）

- [x] Phase 1：棋型查表 + 扁平盤面 make/unmake + 增量評估 + Zobrist（place/undo 7.76µs → 1.92µs）
- [x] Phase 1：五子棋 AI 移入 Web Worker，store 改非同步並加上落子作廢機制
- [x] Phase 2：棋神 `god` — Alpha-Beta(PVS) + 置換表 + 殺手 + 歷史啟發 + VCF 求解器
- [x] Phase 3：天元 `tianyuan` — VCT 求解器 + 開局定式
- [x] Phase 4：無極 `wuji` — 深度搜尋與 VCF／VCT 分派到多個 worker 同時進行
- [x] 確定性自我對弈回歸測試（節點數上限 + `resetSearchMemory()`），`npm run test:gomoku`
- [ ] 五子棋「AI 先手／交換先手」選項（無禁手黑先必勝，AI 執白天生吃虧）

## Phase 0: 開發工具

- [x] `local-admin/` 目錄結構
- [ ] Integrity checker
- [ ] Smoke test 腳本
- [ ] 明棋/暗棋回歸測試腳本
- [ ] Layout matrix 驗證腳本
- [ ] APK build check 腳本

## 程式碼品質 / 重構（詳見 `BUG.md`）

2026-07-02 進行了一輪程式碼審查與修復，已完成並通過型別檢查、build 與離線／實機驗證：

- 單機相關 bug 與重構：B1–B4、B6–B13、R3、R5–R10（明棋 AI Worker 化、確定性、子力調校、暗棋規則參數化等）。
- B5／R9：暗棋引擎規則改為參數傳入，移除單機對全域可變狀態的依賴（未更動線上程式）。

剩餘項目（會動到線上對戰，需搭配 Firebase 實機測試，暫緩）：

- [ ] R1：三個線上頁面（明棋／暗棋／五子棋）抽共用 `useOnlineRoom` hook
- [ ] R2：`service.ts` 送步收尾（勝負／和局／換手）抽共用 `finalizeTurn`

## 後續擴充（Phase 8+）

- [ ] 線上排行榜
- [ ] 成就系統
- [ ] 自訂棋盤/棋子主題
- [ ] 語音聊天（連線模式）
- [ ] 觀戰模式
- [ ] 殘局挑戰模式

---

## 優先建議

1. **高優先級**：雙人重賽
2. **高優先級**：連線規則與視角回歸測試自動化，避免明棋翻面或暗棋吃子規則再回歸
3. **中優先級**：管理工具再強化，例如房間搜尋、批次刪除條件、操作記錄
4. **中優先級**：動畫效果 + 將軍提示（AI Web Worker 已完成）
5. **低優先級**：Capacitor / Android TV / APK 打包
