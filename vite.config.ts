import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Relative base so the site works on GitHub Pages under /<repo>/ and on any host.
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: './',
        name: 'JP Reading — 読む読む',
        short_name: 'JP Reading',
        description:
          'Read Japanese stories with tap-to-look-up dictionary, furigana, romaji, pitch accent, audio, translations and SRS flashcards. Paste any Japanese text to read it the same way.',
        lang: 'en',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        orientation: 'any',
        theme_color: '#c0392b',
        background_color: '#fbf8f3',
        categories: ['education', 'books'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'Review flashcards', short_name: 'Review', url: './#/review', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Read your own text', short_name: 'Import', url: './#/import', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Dictionary', short_name: 'Dictionary', url: './#/dictionary', icons: [{ src: 'icons/icon-192.png', sizes: '192x192' }] },
        ],
        share_target: {
          action: './',
          method: 'GET',
          params: { title: 'share_title', text: 'share_text', url: 'share_url' },
        },
        file_handlers: [
          { action: './', accept: { 'text/plain': ['.txt'], 'text/markdown': ['.md'] } },
        ],
        launch_handler: { client_mode: ['navigate-existing', 'auto'] },
      } as never,
      workbox: {
        // App shell + the whole reading library are precached, so every story works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'data/library/**/*.json'],
        globIgnores: ['data/dict/**', 'kuromoji/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        importScripts: ['sw-reminders.js'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/data/dict/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'dictionary',
              expiration: { maxEntries: 4000, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.includes('/kuromoji/'),
            handler: 'CacheFirst',
            options: { cacheName: 'tokenizer', cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('kanjivg'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'kanjivg',
              expiration: { maxEntries: 3000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 200 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
