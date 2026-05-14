import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function appVersionManifestPlugin(appVersion: string): Plugin {
  return {
    name: 'app-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'app-version.json',
        source: JSON.stringify({ version: appVersion }, null, 2),
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const appVersion = env.VITE_APP_VERSION || 'dev-local'

  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss(), appVersionManifestPlugin(appVersion)],
    server: {
      host: true,
    },
  }
})
