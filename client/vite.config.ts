import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

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
  const basePath = env.VITE_BASE_PATH || '/'

  return {
    base: basePath,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'favicon.ico',
          'icons/apple-touch-icon.png',
          'icons/favicon-32x32.png',
          'icons/favicon-192x192.png',
        ],
        manifest: {
          id: basePath,
          name: 'CChess',
          short_name: 'CChess',
          description: 'Chinese chess, dark chess, and gomoku for tablet-friendly play.',
          start_url: basePath,
          scope: basePath,
          display: 'fullscreen',
          display_override: ['fullscreen', 'standalone', 'minimal-ui'],
          orientation: 'any',
          theme_color: '#f6d68d',
          background_color: '#f6d68d',
          icons: [
            {
              src: 'icons/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icons/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: 'icons/maskable-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: 'icons/maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,json}'],
        },
      }),
      appVersionManifestPlugin(appVersion),
    ],
    server: {
      host: true,
    },
  }
})
