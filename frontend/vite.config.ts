import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'

// Vite 8 no longer rewrites/emits url() assets from node_modules CSS.
// Copy @fontsource font files to dist/assets/files/ so the paths in the
// compiled CSS (./files/geist-*.woff2) resolve correctly in production.
function copyFontsPlugin() {
  return {
    name: 'copy-fontsource-files',
    apply: 'build' as const,
    closeBundle() {
      const sources = [
        path.resolve('node_modules/@fontsource/geist/files'),
        path.resolve('node_modules/@fontsource/geist-mono/files'),
      ]
      const dest = path.resolve('dist/assets/files')
      fs.mkdirSync(dest, { recursive: true })
      for (const src of sources) {
        for (const file of fs.readdirSync(src)) {
          if (file.endsWith('.woff2') || file.endsWith('.woff')) {
            fs.copyFileSync(path.join(src, file), path.join(dest, file))
          }
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      manifest: false, // using public/manifest.webmanifest
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
    copyFontsPlugin(),
  ],
  server: {
    host: true,
    port: Number(process.env.VITE_PORT ?? 5173),
    watch: {
      usePolling: process.env.CHOKIDAR_USEPOLLING === '1',
      interval: Number(process.env.CHOKIDAR_INTERVAL ?? 200),
      ignored: ['**/node_modules/**', '**/.pnpm-store/**', '**/dist/**'],
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
