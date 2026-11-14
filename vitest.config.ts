import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('shared'),
      '@main': resolve('src/main')
    }
  },
  test: {
    environment: 'node',
    include: ['shared/**/*.test.ts', 'src/main/**/*.test.ts'],
    passWithNoTests: true
  }
})
