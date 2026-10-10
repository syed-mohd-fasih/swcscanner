# Changelog

## 0.2.0: server-first

The phone no longer keeps a copy of the data. The server does the work, within the free Firestore plan.

**Architecture**
- **Writes on the server:** every read and write goes through Next.js Server Components and server actions using the Admin SDK. The browser loads no Firebase code (about 190 KB gzipped less JavaScript).
- **Transactions:** each mutation is a Firestore transaction with the domain rules. Duplicate receipts are impossible even when two operators confirm at the same moment.
- **Safe repeats:** every operation carries an `opId`, so a save whose answer was lost is never reported as a conflict again (the v1 "changed by someone else" bug).
- **Retry queue:** a small per-user queue keeps receive, store and release scans when the signal drops and sends them automatically.
- **Sign-in on the server;** Firestore rules now deny all clients.
- **Removed:** IndexedDB, the outbox and sync engine, and the Sync screen.

**Workflow and screens**
- **Receiving:**
  - one-tap carrier buttons, and the camera starts by itself;
  - a progress line ("Today: 12 received · 28 still expected");
  - a compact scan dialog with key fields first and a sticky confirm button;
  - no second "Are you sure?" for operator scans (kept for admin and irreversible actions).
- **Store:** pieces grouped by shipment with consignee and description, a sticky action bar, and a location sheet with the last 5 racks used.
- **Release:** the picking list loads once per session; scans need no second confirm.
- **Dashboard:** compact, tappable rows, operator work first. Dates use the phone's clock (Kuwait time).
- **Manifests:** progress bar per manifest, newest first, server-side search by name.
- **Admin:**
  - usage meter (reads, writes, deletes and storage against the free plan) with an 80% banner;
  - an Admin tab in the phone bottom bar.
- **Errors:** plain-language messages in Arabic and English instead of raw technical errors.
- **Scanner:** uses the phone's built-in barcode reader when available.

**Development**
- **Emulator tests:** `bun run test:emulator` covers the server services, the deny-all rules and a free-plan budget check.
- **Docs:** moved to `docs/`.

## 0.1.0: MVP (local-first)

The first deployed version: receiving, storing, release and admin screens, FedEx PDF417 and DHL multi-barcode support, Arabic and English, Firebase Auth with roles, and Vercel deployment.
