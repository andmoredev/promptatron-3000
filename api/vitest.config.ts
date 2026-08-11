import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      TABLE_NAME: 'promptatron-table',
      ORIGIN: '*',
      POWERTOOLS_SERVICE_NAME: 'promptatron-test',
      POWERTOOLS_LOG_LEVEL: 'ERROR',
    },
  },
});
