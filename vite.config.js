import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      './runtimeConfig': './runtimeConfig.browser',
    }
  },
  optimizeDeps: {
    include: ['@aws-sdk/client-bedrock-runtime', '@aws-sdk/client-bedrock']
  },
  build: {
    chunkSizeWarningLimit: 1600,
    cssMinify: false, // Disable CSS minification to avoid syntax warnings
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          aws: ['@aws-sdk/client-bedrock-runtime', '@aws-sdk/client-bedrock']
        }
      }
    }
  }
})
