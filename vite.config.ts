import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'react',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Momentum — Study Tracker',
        short_name: 'Momentum',
        description: 'Local-first study tracker with timer, assignments, marks, habits, and reports.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
})