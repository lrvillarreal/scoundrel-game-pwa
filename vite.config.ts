import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { offlinePlugin } from './scripts/offline-plugin.mjs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), offlinePlugin()],
  // Avoid colliding with public/Assets on case-insensitive Windows filesystems.
  build: { assetsDir: 'bundles' },
  // Keep this app separate from other projects previously served on Vite defaults.
  server: { host: 'localhost', port: 5178, strictPort: true },
  preview: { host: 'localhost', port: 4178, strictPort: true },
})
