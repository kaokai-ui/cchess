import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { APP_VERSION } from './utils/appVersion'

const APP_VERSION_STORAGE_KEY = 'cchess-app-version'
const APP_VERSION_QUERY_KEY = 'v'
const APP_VERSION_MANIFEST_PATH = 'app-version.json'

async function fetchLatestAppVersion() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
    const manifestUrl = new URL(APP_VERSION_MANIFEST_PATH, baseUrl)
    manifestUrl.searchParams.set('ts', Date.now().toString())
    const response = await window.fetch(manifestUrl.toString(), { cache: 'no-store' })

    if (!response.ok) {
      return null
    }

    const payload = (await response.json()) as { version?: string }
    const latestVersion = payload.version?.trim()
    return latestVersion || null
  } catch {
    return null
  }
}

async function syncAppVersion() {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    const latestVersion = await fetchLatestAppVersion()
    const previousVersion = window.localStorage.getItem(APP_VERSION_STORAGE_KEY)
    const currentUrl = new URL(window.location.href)
    const activeVersion = currentUrl.searchParams.get(APP_VERSION_QUERY_KEY)

    if (latestVersion && latestVersion !== APP_VERSION && activeVersion !== latestVersion) {
      currentUrl.searchParams.set(APP_VERSION_QUERY_KEY, latestVersion)
      window.localStorage.setItem(APP_VERSION_STORAGE_KEY, latestVersion)
      window.location.replace(currentUrl.toString())
      return false
    }

    if (previousVersion && previousVersion !== APP_VERSION && activeVersion !== APP_VERSION) {
      currentUrl.searchParams.set(APP_VERSION_QUERY_KEY, APP_VERSION)
      window.localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION)
      window.location.replace(currentUrl.toString())
      return false
    }

    window.localStorage.setItem(APP_VERSION_STORAGE_KEY, APP_VERSION)
  } catch {
    // Ignore storage or URL sync failures and continue booting the app.
  }

  return true
}

async function boot() {
  const shouldRender = await syncAppVersion()

  if (!shouldRender) {
    return
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
