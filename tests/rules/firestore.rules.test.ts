import { readFileSync } from "node:fs"

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { afterAll, beforeAll, describe, it } from "vitest"

/**
 * Only the server (Admin SDK) touches Firestore; the rules deny every client,
 * signed in or not, whatever its role claim.
 */
let env: RulesTestEnvironment

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-rules-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  })
})

afterAll(async () => {
  await env?.cleanup()
})

describe("firestore.rules", () => {
  const clients = () => [
    env.unauthenticatedContext().firestore(),
    env.authenticatedContext("op1", { role: "OPERATOR" }).firestore(),
    env.authenticatedContext("ad1", { role: "ADMIN" }).firestore(),
  ]

  it("denies all client reads", async () => {
    for (const db of clients()) {
      for (const path of ["items/x", "manifests/x", "locations/x", "carriers/x", "users/x"]) {
        await assertFails(getDoc(doc(db, path)))
      }
    }
  })

  it("denies all client writes", async () => {
    for (const db of clients()) {
      await assertFails(setDoc(doc(db, "items/x"), { itemId: "X" }))
      await assertFails(setDoc(doc(db, "carriers/TNT"), { name: "TNT" }))
    }
  })
})
