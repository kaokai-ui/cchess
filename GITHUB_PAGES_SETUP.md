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
- Firebase Console 的 App Check 已註冊你的 Web App
- reCAPTCHA allowed domains 已加入你的 GitHub Pages 網域

例如：

- `YOUR_NAME.github.io`
- `YOUR_NAME.github.io/REPO_NAME/` 對應的主網域 `YOUR_NAME.github.io`

## 3. Push 後自動部署

workflow 目前監看 `main` 和 `master` 分支。只要推送到其中之一，就會自動部署到 GitHub Pages。

目前 workflow 已直接設定 GitHub Pages 建置需要的 Firebase Web config。
不要在正式 workflow 裡加入 `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`。
