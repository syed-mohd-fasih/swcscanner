import { ulid } from "ulid"

/**
 * Client-generated unique IDs. ULIDs sort by creation time and let offline
 * creates be retried idempotently (the same ID is written every attempt).
 */
export function newId(): string {
  return ulid()
}
