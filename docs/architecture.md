# Architecture

## Server-first

The phone only scans and shows screens. Every read and write goes through the Next.js server, which talks to Firestore with the Firebase Admin SDK. The browser loads no Firebase code.

```
Phone (React)                         Next.js server                            Firestore
─────────────                         ──────────────                            ─────────
pages ─────────── render ───────────► app/**/page.tsx ── server/data/* ───────► reads (paged, cached)
camera → parse barcode on the phone
scan / confirm ── server action ────► app/actions/* ── server/services/* ──────► transaction
                                        (role check, zod)   (domain rules)
retry queue (localStorage) ─ resend ─►  same action, same opId → answered as success if already done
```

## Folders

| Folder | What lives there |
|---|---|
| `domain/` | Pure business rules with unit tests: receipt, store, release scan, outcome, merge, manifest expansion. Each item is one physical piece, with separate receiving, storage and release states. |
| `carriers/` | Barcode parsers (generic 1D, FedEx PDF417) and `resolveScans`, which picks the item barcode out of everything in view. Runs on the phone and the server. |
| `server/data/` | Read side: exact or paged Firestore queries, cached config (carriers, locations, manifest headers), cached counts. `server-only`. (`usage.ts`, the usage meter, is commented out; see [Free-plan budget](free-plan-budget.md).) |
| `server/services/` | Write side: every mutation runs in a Firestore transaction that applies the `domain/` rule. |
| `server/guard.ts` | Shared checks for server actions: signed-in role and input validation. |
| `app/actions/` | Server actions (`operator.ts`, `admin.ts`), thin wrappers around the services. |
| `app/**/page.tsx` | Server Components: check the role, load the screen's data, render. |
| `components/` | Client UI. Screens hold their own state after the first render and call actions. |
| `lib/auth/` | Session cookie login. `requireRole` / `authorize` verify the cookie on the server; `proxy.ts` only redirects early. |
| `lib/retry-queue.ts` | The small offline queue for scan actions. |
| `lib/i18n/` | Arabic (default, RTL) and English text. |

## Writes: transactions and idempotency

A service reads the pieces inside a transaction, applies the domain rule, and writes the result:
- **Duplicate receipts:** if two operators confirm the same piece at once, exactly one wins. The other gets "This piece was already recorded".
- **Bulk actions** (store N pieces, assign outcomes) are all-or-nothing.

Every operation also carries an **`opId`**, a ULID created on the phone, and the written piece stores it as `lastOpId`:
- **Replays:** if the same operation arrives again (the answer got lost, or the retry queue resends), the server sees its own `opId` and answers success without writing again.
- **New records** use the `opId` as the document ID, so a replay finds the record it already made. This covers unidentified pieces and new manifests.

## The retry queue

Receive, record unidentified, flag mismatch, store and release scan go through `runOp` (`lib/retry-queue.ts`):
- **Network fails:** the operation is kept in `localStorage` and the operator sees "kept on the phone".
- **When it is resent:** on reconnect, on app start, and every 15 s while something is waiting.
- **Refusals:** if the server refuses it (e.g. someone else received that piece first), it stays in the list with the plain-language reason until retried or removed.
- **Per user:** the queue is kept per signed-in user, so a shared phone never sends one operator's scans as another's.

Lookups are never queued; they need the server.

## Reads and caching

- **Config:** carriers and locations are loaded once by the `(app)` layout from a shared server cache (`unstable_cache`, which persists across Vercel instances). An admin change clears the cache tag and refreshes the screen.
- **Manifest headers** for scan lookups are cached for an hour.
- **Counts** (dashboard, receiving progress, manifest progress) are Firestore count queries cached for 60 s.
- **Lists** are bounded: awaiting storage 100, release picking list 150, outcomes and unidentified 200, manifests 30 newest (search by name prefix for older ones).

After a mutation, scanning screens update their own lists. Admin screens call `router.refresh()`, which re-renders the page on the server.

## Security

- **Firestore rules deny every client** (`firestore.rules`). Only the server's Admin SDK touches data.
- **Each page and server action checks the role itself** with `requireRole` / `authorize`. Operators can receive, record unidentified pieces, flag mismatches, store and release-scan. Everything else is admin-only.
- **Sign-in happens on the server.** `POST /api/session` sends the username and password to Firebase Auth's REST API and sets an httpOnly session cookie. Usernames are stored as `username@swc.local`, and the role lives in a custom claim.
- **Sign-out on disable:** session cookies are re-checked against Firebase Auth (revocation) at least every 2 minutes, so a disabled user is cut off quickly.
