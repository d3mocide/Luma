import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.png', 'icons/*.svg', 'assets/*.svg'],
      manifest: false, // using public/manifest.webmanifest
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Activate new SW immediately so iOS PWAs pick up fixes on next launch
        // instead of waiting for every installed instance to be closed.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^\/api\/v1\/today$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'today-cache',
              expiration: { maxAgeSeconds: 3600 },
            },
          },
        ],
      },
    }),
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
