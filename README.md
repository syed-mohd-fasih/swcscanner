# SWC Scanner

SWC Scanner is a local-first warehouse receiving and release app (a Next.js PWA). Operators use it on their phones: they scan carrier barcodes with the camera, check each piece against the manifest, then store it or mark it for direct release. Later they scan it again to release it. Admins enter manifests, manage locations, carriers and users, look into unidentified items, and assign the final release outcome.

Every scan is handled on the device in IndexedDB. Changes go to Firestore in batches through an outbox, never as one Firestore request per scan.

## Requirements

- [Bun](https://bun.sh) 1.4+
- Java 11+ (for the Firestore emulator), e.g. `winget install EclipseAdoptium.Temurin.21.JDK`
- Chrome or Edge for testing. Phones need HTTPS or the Chrome flag described below.

## Run locally

You don't need a Firebase project. The app runs entirely against the Firebase emulators on your machine; `.env.development` points it at them (project `demo-swcscanner`).

### First time only

```bash
bun install          # dependencies (also copies the barcode decoder into public/zxing)
java -version        # must print 11 or newer; if "not recognized", restart VS Code / the terminal
```

### Every time

Use two terminals, both in the project folder.

**Terminal 1: start the emulators and leave them running**

```bash
bun run emulators
```

Wait for `All emulators ready!`. The emulator UI at http://localhost:4000 lets you browse Firestore data and Auth users.

**Terminal 2: start the app**

```bash
bun dev
```

Open http://localhost:3000 (Next picks 3001 if 3000 is busy; the terminal shows which).

### Demo data

```bash
bun run seed
```

Run this in a terminal while the emulators are running. It **wipes** the emulators and loads demo manifests, pieces, locations, carriers and users:

- `admin / admin12345` (ADMIN)
- `operator / operator123` (OPERATOR)

You need it the first time, and again whenever you want a clean slate. After seeding, log out and back in (or clear the site data in the browser), because each device keeps its own local copy in IndexedDB. Admin → System → "Clear device data" also clears it.

### Stopping

Press `Ctrl+C` in each terminal. Stopping the emulators with `Ctrl+C` saves their data to `.emulator-data/` (git-ignored), and the next `bun run emulators` loads it back, so your test data survives restarts. If you kill the emulators any other way, the latest changes since the last start are lost; `bun run seed` gets you back to a known state.

### Troubleshooting

- **"Port … is not open" / "could not start Firestore Emulator, port taken":** emulators from an earlier run are still alive. Close that terminal, or end the leftover `java` process in Task Manager.
- **Login says wrong username or password:** the emulators have no users yet (first run, or saved data was lost). Run `bun run seed`.
- **Pages load but nothing appears / "All saved" never shows:** the emulators aren't running. Start terminal 1.

### Testing on a phone (camera)

Browsers only allow the camera on HTTPS or `localhost`. The app sends emulator traffic through its own address (see `rewrites` in `next.config.ts`), so you only ever expose port 3000.

**Easiest: an HTTPS tunnel (works on any phone, including iPhone)**

```bash
cloudflared tunnel --url http://localhost:3000
```

Open the `https://….trycloudflare.com` address it prints on the phone. A brand-new tunnel address can take up to a minute before it resolves. You don't need to change anything else.

**Alternative: same Wi-Fi (Android Chrome)**

1. `bun run dev:lan`, then open `http://<pc-lan-ip>:3000` on the phone.
2. On the phone, open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, add `http://<pc-lan-ip>:3000`, and relaunch Chrome.
3. Allow port 3000 through the PC firewall.

In development, the receiving and release screens also have a typed-barcode field and test barcodes, so you can run the whole flow without a camera.

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` / `dev:lan` | Next dev server (LAN-bound variant for phones) |
| `bun run emulators` | Firebase emulators, keeping data in `.emulator-data/` |
| `bun run seed` | Reset the emulators and load demo data |
| `bun run test` | Unit tests: domain rules, carrier parsers |
| `bun run test:rules` | Firestore security-rules tests (needs the emulators running) |
| `bun run typecheck` / `lint` | Type check and lint |

## Architecture

```
UI (app/, components/)  →  services/  →  repositories/ (interfaces)  →  IndexedDB (lib/db)
                                                                            ↓ outbox
                                                         sync/engine  →  Firestore (rules = authz)
```

- **`domain/`** holds the pure business rules, with unit tests. Each item is one physical piece. Its state is tracked in separate fields (receiving, storage, release), never as one combined status.
- **`carriers/`** holds the barcode parsers. `fedexPdf417` decodes the PDF417 data directly; there is no OCR.
- **`repositories/`** holds the IndexedDB and Firestore implementations behind interfaces. Components never call either database directly.
- **`sync/`** contains the outbox engine (batched, retried with backoff, version-checked), the pull functions (per-carrier workspace, then only changes), and conflict handling (the server wins).
- **`lib/auth/`** handles login sessions. A Firebase session cookie is checked server-side by `requireRole()`, and `proxy.ts` only does a quick early redirect. Firestore rules enforce roles on writes.
- **`lib/i18n/`** has the Arabic (default, RTL) and English UI text. The language is chosen per device. Data stays in English.

## Waiting on client input (interfaces are ready)

- **FedEx PDF417:** the layout is checked against real scans (`carriers/fedex/fedexPdf417.ts`). Two things still need confirming with the client: that `28Z` is the master tracking number on multi-piece labels, and whether manifests list the 12-digit tracking number or the 16-digit one (lookups accept both). The fixtures follow the real structure, with personal data replaced by fake values.
- **Carrier codes:** carriers are managed by the admin under Admin → Carriers. The seeded codes are placeholders.
- **Export format:** add an `ExportFormat` in `services/export.ts`. CSV and JSON exist as placeholders.
- **Manifest import:** register a `ManifestImporter` in `services/import.ts`.
