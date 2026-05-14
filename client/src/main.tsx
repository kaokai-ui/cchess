import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { APP_VERSION } from './utils/appVersion'

const APP_VERSION_STORAGE_KEY = 'cchess-app-version'
const APP_VERSION_QUERY_KEY = 'v'

function syncAppVersion() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const previousVersion = window.localStorage.getItem(APP_VERSION_STORAGE_KEY)
    const currentUrl = new URL(window.location.href)
    const activeVersion = currentUrl.searchParams.get(APP_VERSION_QUERY_KEY)

    if (previousVersion && previousVersion !== APP_VERSION && activeVersion !== APP_VERSION) {
      currentUrl.searchParams.set(APP_VERSION_QUERY_KEY, APP_VERSION)
      window.localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION)
      window.location.replace(currentUrl.toString())
      return
    }

    window.localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION)
  } catch {
    // Ignore storage or URL sync failures and continue booting the app.
  }
}

syncAppVersion()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
