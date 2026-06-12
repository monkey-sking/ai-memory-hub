import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const hubTarget = process.env.VITE_HUB_API_TARGET || 'http://127.0.0.1:38787'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: hubTarget,
        changeOrigin: true
      },
      '/ws': {
        target: hubTarget,
        ws: true
      }
    }
  }
})
