import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/**
 * Tests that need the Firestore emulator on :8080 (bun run emulators):
 * the server services (transactions, idempotency) and the deny-all rules.
 */
export default defineConfig({
  resolve: {
    alias: [
      { find: "server-only", replacement: at("./tests/stubs/server-only.ts") },
      { find: "next/cache", replacement: at("./tests/stubs/next-cache.ts") },
      { find: "@", replacement: at("./") },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts", "tests/server/**/*.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
    env: {
      NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-server-test",
      FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
      METADATA_SERVER_DETECTION: "none",
    },
  },
})
