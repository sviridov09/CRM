import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Разрешаем импорт из ../shared (общие типы и утилиты с мобилкой)
  server: { fs: { allow: ['..'] } },
})
