import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'SunPlus Trade Management',
        short_name: 'SunPlus',
        description: 'Trade file and document management',
        theme_color: '#4f6ef7',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'any',
        start_url: '/dashboard',
        scope: '/',
        lang: 'en',
        icons: [
          { src: '/icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB
        // Cache app shell (exclude legacy large stamp/signature files)
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}', 'icons/*.png', 'apple-touch-icon.png'],
        globIgnores: ['stamp.png', 'signature.png'],
        // Network-first for API calls, cache-first for assets
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              networkTimeoutSeconds: 10,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false, // disabled in dev, active only in build
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
