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
    // Expose MOMENTO_API_KEY to the client
    'process.env.MOMENTO_API_KEY': JSON.stringify(process.env.MOMENTO_API_KEY),
  },
  resolve: {
    alias: {
      './runtimeConfig': './runtimeConfig.browser',
    }
  },
  optimizeDeps: {
    include: ['@aws-sdk/client-bedrock-runtime', '@aws-sdk/client-bedrock', '@gomomento/sdk-web']
  },
  build: {
    chunkSizeWarningLimit: 1600,
    cssMinify: false, // Disable CSS minification to avoid syntax warnings
    rollupOptions: {
      output: {
        // Name key vendor groups explicitly to avoid giant catch-all chunks
        manualChunks: {
          vendor: ['react', 'react-dom'],
          aws: ['@aws-sdk/client-bedrock-runtime', '@aws-sdk/client-bedrock'],
          momento: ['@gomomento/sdk-web']
        }
      }
    }
  }
})
