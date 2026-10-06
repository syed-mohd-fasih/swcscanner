/**
 * Self-host the ZXing decoder: copy the WASM that `barcode-detector` uses
 * into public/ so scanning never depends on a CDN.
 */
import { copyFileSync, mkdirSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

const require = createRequire(import.meta.url)
const pkg = require.resolve("zxing-wasm/package.json", {
  paths: [dirname(require.resolve("barcode-detector/package.json"))],
})
const source = join(dirname(pkg), "dist", "reader", "zxing_reader.wasm")
const target = join(process.cwd(), "public", "zxing", "zxing_reader.wasm")

mkdirSync(dirname(target), { recursive: true })
copyFileSync(source, target)
console.log(`copied ${source} → ${target}`)
