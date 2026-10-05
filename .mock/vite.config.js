import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
export default defineConfig({ root: path.resolve(__dirname, '..'), plugins: [react(),
  { name: 'mock', enforce: 'pre', resolveId(id, imp) { if (id.endsWith('/supabase') && imp && !imp.includes('.mock')) return path.resolve(__dirname, 'supabase.js') } }] })
