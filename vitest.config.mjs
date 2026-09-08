import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Базовое окружение — node (серверные тесты);
    // клиентские тесты включают jsdom прагмой @vitest-environment в файле
    environment: 'node',
    include: ['tests/**/*.test.mjs'],
    testTimeout: 10000,
    hookTimeout: 10000
  }
});
