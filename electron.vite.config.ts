import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main'
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/preload'
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      emptyOutDir: true
    },
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    }
  }
})
