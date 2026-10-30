import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8787' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\\\/g, '/')
          if (moduleId.includes('/node_modules/three/')) return 'three'
          if (moduleId.includes('/node_modules/jspdf/')) return 'pdf-export'
          if (moduleId.endsWith('/src/components/Charts.tsx')) return 'charts'
        },
      },
    },
  },
})
