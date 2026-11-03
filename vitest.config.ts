import { defineConfig } from 'vitest/config'
// Share one React instance across DSH client packages and tests.
export default defineConfig({
  resolve: { dedupe: ['react', 'react-dom'] },
  // The suite runs real subprocesses and a full Runtime per file, so it exceeds the 5 s default once the test files
  // share fewer cores: a two-core Windows runner timed out in a different file on each run. Files that need more still
  // raise it themselves.
  test: { include: ['tests/**/*.spec.{ts,tsx}'], testTimeout: 15_000 },
})
