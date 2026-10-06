import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

/** Firestore security-rules tests — need the Firestore emulator on :8080. */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/rules/**/*.test.ts"],
    testTimeout: 20_000,
    fileParallelism: false,
  },
})
