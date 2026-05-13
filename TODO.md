# 未實作功能清單

根據 DEVELOPMENT_PLAN.md 規劃，以下功能尚未實作：

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
- [x] 管理介面（即時監看房間 / 連線用戶）
- [ ] Spark 方案下的手動清房 SOP 文件
- [ ] 完整斷線重連與身份 reclaim 流程
- [ ] 雙人重賽流程

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

- [ ] Web Worker 執行 AI（避免 UI 阻塞）
- [ ] AI 確定性測試場景
- [ ] 殺手啟發（Killer Moves）
- [ ] 歷史啟發（History Heuristic）
- [ ] 置換表（Transposition Table / Zobrist Hashing）

## Phase 0: 開發工具

- [ ] `local-admin/` 目錄結構
- [ ] Integrity checker
- [ ] Smoke test 腳本
- [ ] 明棋/暗棋回歸測試腳本
- [ ] Layout matrix 驗證腳本
- [ ] APK build check 腳本

## 後續擴充（Phase 8+）

- [ ] 線上排行榜
- [ ] 成就系統
- [ ] 自訂棋盤/棋子主題
- [ ] 語音聊天（連線模式）
- [ ] 觀戰模式
- [ ] 殘局挑戰模式

---

## 優先建議

1. **高優先級**：完整斷線重連 / 身份 reclaim + 雙人重賽
2. **中優先級**：動畫效果 + 將軍提示 + AI Web Worker
3. **低優先級**：Capacitor / Android TV / APK 打包
