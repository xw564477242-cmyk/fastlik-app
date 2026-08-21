import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const dataSource = (process.env.VITE_FASTLINK_DATA_SOURCE || env.VITE_FASTLINK_DATA_SOURCE || 'backend').trim().toLowerCase()
  if (mode === 'production' && dataSource === 'mock') {
    throw new Error('Production Wallet build forbids VITE_FASTLINK_DATA_SOURCE=mock')
  }
  return {
    plugins: [react()],
    base: env.VITE_PUBLIC_BASE || '/fastlik-app/',
    build: {
      // Modern target browsers support modulepreload. Disabling Vite's legacy
      // polyfill also keeps the distribution free of an unrelated anonymous
      // fetch branch that conflicts with the Wallet's Cookie-Session audit.
      modulePreload: {polyfill: false},
    },
  }
})
