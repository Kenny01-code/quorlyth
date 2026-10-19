import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react-vendor'
          if (/[\\/]node_modules[\\/](three|ogl)[\\/]/.test(id)) return 'graphics-vendor'
          if (/[\\/]node_modules[\\/]jspdf[\\/]/.test(id)) return 'pdf-vendor'
          if (/[\\/]node_modules[\\/]qrcode[\\/]/.test(id)) return 'qrcode-vendor'
          if (/[\\/]node_modules[\\/](@supabase|react-router|@remix-run)[\\/]/.test(id)) return 'platform-vendor'
        },
      },
    },
  },
})
