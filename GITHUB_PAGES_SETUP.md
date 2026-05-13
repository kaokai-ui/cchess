# GitHub Pages Setup

這個專案已包含 GitHub Pages workflow：

- [`.github/workflows/deploy-pages.yml`](D:/Game/CChess/.github/workflows/deploy-pages.yml)

## 1. GitHub Pages Source

在 GitHub repository：

- `Settings -> Pages`
- `Build and deployment -> Source`
- 選擇 `GitHub Actions`

## 2. App Check / reCAPTCHA

正式上線前，請確認：

- `client/.env` 只給本機使用，不要上傳
- `local-admin/` 只給本機管理使用，不要上傳
- Firebase Console 的 App Check 已註冊你的 Web App
- reCAPTCHA allowed domains 已加入你的 GitHub Pages 網域

例如：

- `YOUR_NAME.github.io`
- `YOUR_NAME.github.io/REPO_NAME/` 對應的主網域 `YOUR_NAME.github.io`

## 3. Push 後自動部署

workflow 目前監看 `main` 和 `master` 分支。只要推送到其中之一，就會自動部署到 GitHub Pages。

目前 workflow 已直接設定 GitHub Pages 建置需要的 Firebase Web config。
不要在正式 workflow 裡加入 `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`。

## 4. 公開站與本機管理的界線

- GitHub Pages 公開站 **不包含** `/admin`
- 管理功能只放在本機：
  - `node local-admin/server.mjs`
  - `http://127.0.0.1:5179/admin`
- 本機管理頁使用：
  - `client/.env`
  - `local-admin/appcheck-debug-token.json`
  - Realtime Database `admins/{uid} = true`

## 5. 目前注意事項

- 不要把 App Check debug token 放進 GitHub Pages workflow 或 `client/.env.example`
- 若想直接輸入網址開公開站子頁面，專案已加入 GitHub Pages SPA fallback
- 若 Pages 更新後仍看到舊畫面，請重新整理或加上 query string 例如 `?v=commit-sha`
