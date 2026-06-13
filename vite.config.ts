import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/momentum/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        navigateFallback: '/momentum/index.html',
        clientsClaim: true,
        skipWaiting: true,
      },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Momentum — Study Tracker',
        short_name: 'Momentum',
        description: 'Local-first study tracker with timer, assignments, marks, habits, and reports.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: '/momentum/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/momentum/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
        },
      },
    },
  },
}))