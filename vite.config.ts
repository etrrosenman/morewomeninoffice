import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative assets work both at /morewomeninthehouse/ and on the custom domain.
  base: './',
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.ts' },
})
