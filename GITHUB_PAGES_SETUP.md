# GitHub Pages Setup

這個專案已包含 GitHub Pages workflow：

- [`.github/workflows/deploy-pages.yml`](D:/Game/CChess/.github/workflows/deploy-pages.yml)

## 1. GitHub Repository Variables

在 GitHub repository 的 `Settings -> Secrets and variables -> Actions -> Variables` 建立：

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_ENABLE_APPCHECK`
- `VITE_FIREBASE_APPCHECK_SITE_KEY`

建議值：

- `VITE_ENABLE_APPCHECK=true`

不要在 GitHub Pages 正式環境使用 `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`。

## 2. GitHub Pages Source

在 GitHub repository：

- `Settings -> Pages`
- `Build and deployment -> Source`
- 選擇 `GitHub Actions`

## 3. App Check / reCAPTCHA

正式上線前，請確認：

- `client/.env` 只給本機使用，不要上傳
- Firebase Console 的 App Check 已註冊你的 Web App
- reCAPTCHA allowed domains 已加入你的 GitHub Pages 網域

例如：

- `YOUR_NAME.github.io`
- `YOUR_NAME.github.io/REPO_NAME/` 對應的主網域 `YOUR_NAME.github.io`

## 4. Push 後自動部署

workflow 目前監看 `master` 分支。只要推送到 `master`，就會自動部署到 GitHub Pages。
