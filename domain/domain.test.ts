import { describe, expect, it } from "vitest"

import { createItem, type MutationContext } from "@/domain/items/factory"
import type { Item } from "@/domain/items/types"
import { expandManifestLine, generateManifestName, summarizeManifest } from "@/domain/manifests/rules"
import { pieceProgress, rankCandidates } from "@/domain/receiving/candidates"
import { confirmReceipt, flagQuantityMismatch, isAwaitingStorage, recordUnidentified, storePiece } from "@/domain/receiving/rules"
import { assignOutcome, releaseScan } from "@/domain/release/rules"
import { daysBetween, isBusinessDate } from "@/domain/shared/dates"
import { mergeUnidentified } from "@/domain/unidentified/rules"

const ctx: MutationContext = { actorId: "op1", now: "2026-10-05T10:00:00.000Z" }
const validLocation = (id: string) => id === "A-01-01"

function expectOk<T>(r: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r.error)}`)
  return r.value
}

function manifestPieces(itemId: string, quantity: number, manifestId = "M1"): Item[] {
  return expectOk(
    expandManifestLine(
      {
        itemId,
        carrierCode: "TNT",
        shipper: "S",
        consignee: "C",
        quantity,
        weight: 1,
        description: null,
      },
      manifestId,
      ctx
    )
  )
}

describe("dates", () => {
  it("validates business dates", () => {
    expect(isBusinessDate("2026-10-05")).toBe(true)
    expect(isBusinessDate("2026-02-30")).toBe(false)
    expect(daysBetween("2026-10-05", "2026-10-02")).toBe(3)
  })
})

describe("manifests", () => {
  it("generates the manifest name", () => {
    expect(generateManifestName("fdx", "2026-10-05", "KWT1234")).toBe("FDX-10-5-2026-KWT1234")
  })

  it("expands a line into N expected pieces sharing the itemId", () => {
    const pieces = manifestPieces("MASTER-001", 5)
    expect(pieces.map((p) => `${p.pieceNumber}/${p.pieceTotal}`)).toEqual([
      "1/5", "2/5", "3/5", "4/5", "5/5",
    ])
    expect(new Set(pieces.map((p) => p.itemId))).toEqual(new Set(["MASTER-001"]))
    expect(new Set(pieces.map((p) => p.internalItemId)).size).toBe(5)
    expect(pieces.every((p) => p.receivingState === "expected" && p.storageState === null)).toBe(true)
  })

  it("rejects invalid quantities", () => {
    const r = expandManifestLine(
      { itemId: "X", carrierCode: "TNT", shipper: null, consignee: null, quantity: 0, weight: null, description: null },
      "M1",
      ctx
    )
    expect(r.ok).toBe(false)
  })
})

describe("receiving", () => {
  it("receives without a location — the piece then awaits storage", () => {
    const [piece] = manifestPieces("A1", 1)
    const r = expectOk(confirmReceipt(piece, { path: "store_later", dateOfReceival: "2026-10-05" }, ctx))
    expect(r.receivingState).toBe("received")
    expect(r.storageState).toBeNull()
    expect(r.locationId).toBeNull()
    expect(isAwaitingStorage(r)).toBe(true)
    expect(r.version).toBe(piece.version + 1)
  })

  it("stores an awaiting piece at a valid location, once", () => {
    const [piece] = manifestPieces("A1", 1)
    const received = expectOk(confirmReceipt(piece, { path: "store_later", dateOfReceival: "2026-10-05" }, ctx))
    expect(storePiece(received, "Z-99-99", ctx, validLocation).ok).toBe(false)
    const stored = expectOk(storePiece(received, "A-01-01", ctx, validLocation))
    expect(stored.storageState).toBe("stored")
    expect(stored.locationId).toBe("A-01-01")
    expect(stored.storedBy).toBe("op1")
    expect(storePiece(stored, "A-01-01", ctx, validLocation).ok).toBe(false)
  })

  it("cannot store an expected (not received) piece", () => {
    const [piece] = manifestPieces("A1", 1)
    expect(storePiece(piece, "A-01-01", ctx, validLocation).ok).toBe(false)
  })

  it("blocks confirming the same piece twice", () => {
    const [piece] = manifestPieces("A1", 1)
    const once = expectOk(
      confirmReceipt(piece, { path: "direct_release", dateOfReceival: "2026-10-05" }, ctx)
    )
    const twice = confirmReceipt(
      once,
      { path: "direct_release", dateOfReceival: "2026-10-05" }, ctx)
    expect(twice.ok).toBe(false)
    if (!twice.ok) expect(twice.error.code).toBe("PIECE_ALREADY_CONFIRMED")
  })

  it("direct release needs no location and is never awaiting storage", () => {
    const [piece] = manifestPieces("A1", 1)
    const direct = expectOk(
      confirmReceipt(piece, { path: "direct_release", dateOfReceival: "2026-10-05" }, ctx)
    )
    expect(direct.locationId).toBeNull()
    expect(direct.storageState).toBe("direct_release")
    expect(direct.releaseState).toBe("not_released")
  })

  it("reports piece progress for a multi-piece group", () => {
    const pieces = manifestPieces("MASTER-001", 6)
    const received = [0, 2, 4].map((i) =>
      expectOk(
        confirmReceipt(pieces[i], { path: "direct_release", dateOfReceival: "2026-10-05" }, ctx)
      )
    )
    const group = pieces.map((p) => received.find((r) => r.internalItemId === p.internalItemId) ?? p)
    expect(pieceProgress(group, "manifested")).toEqual({ total: 6, found: [1, 3, 5], available: [2, 4, 6] })
  })

  it("records unidentified pieces as a group and blocks duplicates", () => {
    const label = { itemId: "UNK-9", carrierCode: "ARX", shipper: "X", consignee: null, weight: null, description: null }
    const first = expectOk(
      recordUnidentified(
        { label, pieceNumber: 1, pieceTotal: 3, path: "store_later", dateOfReceival: "2026-10-05" },
        [], ctx)
    )
    expect(first.receivingState).toBe("unidentified")
    expect(first.manifestId).toBeNull()
    expect(first.investigation?.status).toBe("open")

    const dup = recordUnidentified(
      { label, pieceNumber: 1, pieceTotal: 3, path: "store_later", dateOfReceival: "2026-10-05" },
      [first], ctx)
    expect(dup.ok).toBe(false)
    expect(pieceProgress([first], "unidentified")).toEqual({ total: 3, found: [1], available: [2, 3] })
  })

  it("flags quantity mismatch without changing the total", () => {
    const [piece] = manifestPieces("A1", 5)
    const flagged = expectOk(flagQuantityMismatch(piece, 6, "label says 6/5", ctx))
    expect(flagged.pieceTotal).toBe(5)
    expect(flagged.quantityMismatch).toEqual({ labelTotal: 6, note: "label says 6/5" })
  })

  it("ranks candidate groups by availability and date proximity", () => {
    const near = manifestPieces("DUP", 1, "M-near")
    const far = manifestPieces("DUP", 1, "M-far")
    const dates = new Map([
      ["M-near", "2026-10-05"],
      ["M-far", "2026-09-01"],
    ])
    const groups = rankCandidates([...far, ...near], dates, "2026-10-05")
    expect(groups.map((g) => g.manifestId)).toEqual(["M-near", "M-far"])
  })
})

describe("release", () => {
  function receivedPiece(): Item {
    const [piece] = manifestPieces("R1", 1)
    const received = expectOk(confirmReceipt(piece, { path: "store_later", dateOfReceival: "2026-10-01" }, ctx))
    return expectOk(storePiece(received, "A-01-01", ctx, validLocation))
  }

  it("rejects release scan of a piece still awaiting storage", () => {
    const [piece] = manifestPieces("R3", 1)
    const received = expectOk(confirmReceipt(piece, { path: "store_later", dateOfReceival: "2026-10-01" }, ctx))
    expect(releaseScan(received, ctx).ok).toBe(false)
  })

  it("requires a release scan before an outcome", () => {
    const piece = receivedPiece()
    const r = assignOutcome([piece], "released", "2026-10-05", {}, ctx)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.code).toBe("NOT_RELEASE_SCANNED")
  })

  it("rejects release scan of an expected (not received) piece", () => {
    const [piece] = manifestPieces("R2", 1)
    expect(releaseScan(piece, ctx).ok).toBe(false)
  })

  it("assigns outcome with the business release date", () => {
    const scanned = expectOk(releaseScan(receivedPiece(), ctx))
    const [out] = expectOk(assignOutcome([scanned], "seized", "2026-10-06", {}, ctx))
    expect(out.releaseState).toBe("seized")
    expect(out.dateOfRelease).toBe("2026-10-06")
  })

  it("requires the override for unidentified pieces and marks them identified", () => {
    const unk = expectOk(
      recordUnidentified(
        {
          label: { itemId: "U1", carrierCode: "DHL", shipper: null, consignee: null, weight: null, description: null },
          pieceNumber: 1,
          pieceTotal: 1,
          path: "direct_release",
          dateOfReceival: "2026-10-05",
        },
        [], ctx)
    )
    const scanned = expectOk(releaseScan(unk, ctx))
    const blocked = assignOutcome([scanned], "released", "2026-10-05", {}, ctx)
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error.code).toBe("OVERRIDE_REQUIRED")
    const [out] = expectOk(assignOutcome([scanned], "released", "2026-10-05", { overrideIdentify: true }, ctx))
    expect(out.receivingState).toBe("received")
    expect(out.identifiedByOverride).toBe(true)
  })
})

describe("unidentified merge", () => {
  it("moves physical facts onto the expected record", () => {
    const [expected] = manifestPieces("LATE-1", 1)
    const unk = createItem(
      {
        itemId: "LATE-1",
        pieceNumber: 1,
        pieceTotal: 1,
        carrierCode: "TNT",
        receivingState: "unidentified",
        storageState: "stored",
        locationId: "A-01-01",
        dateOfReceival: "2026-09-28",
        receivedBy: "op2",
        receivedAt: "2026-09-28T08:00:00.000Z",
      },
      ctx
    )
    const { updated, deletedInternalItemId } = expectOk(mergeUnidentified(unk, expected, ctx))
    expect(updated.receivingState).toBe("received")
    expect(updated.locationId).toBe("A-01-01")
    expect(updated.dateOfReceival).toBe("2026-09-28")
    expect(updated.receivedBy).toBe("op2")
    expect(updated.mergedFromInternalItemId).toBe(unk.internalItemId)
    expect(deletedInternalItemId).toBe(unk.internalItemId)
  })
})

describe("summary", () => {
  it("derives not-received from expected pieces", () => {
    const pieces = manifestPieces("S1", 3)
    const first = expectOk(
      confirmReceipt(pieces[0], { path: "direct_release", dateOfReceival: "2026-10-05" }, ctx)
    )
    const s = summarizeManifest([first, pieces[1], pieces[2]])
    expect(s.expected).toBe(3)
    expect(s.received).toBe(1)
    expect(s.notReceived).toBe(2)
    expect(s.directRelease).toBe(1)
  })
})
