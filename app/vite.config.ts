import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The client is a thin SPA over the Promptatron API: no AWS SDK, no Momento,
 * no `process.env` shims. It reaches the server at `VITE_API_URL`
 * (default `http://localhost:8000`), which serves CORS itself — hence no dev
 * proxy here.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  }
})
