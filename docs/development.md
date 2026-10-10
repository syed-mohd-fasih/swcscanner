# Running locally

Locally the app runs entirely against the Firebase emulators on your machine. No Firebase project is needed: `.env.development` points at them (project `demo-swcscanner`).

## Requirements

- [Bun](https://bun.sh) 1.4+
- Java 11+ for the Firestore emulator, e.g. `winget install EclipseAdoptium.Temurin.21.JDK`
- Chrome or Edge

## First time

```bash
bun install          # also copies the barcode decoder into public/zxing
java -version        # must print 11 or newer
```

## Every time

Use two terminals in the project folder.

```bash
bun run emulators    # terminal 1 — wait for "All emulators ready!"
bun dev              # terminal 2 — http://localhost:3000
```

The emulator UI at http://localhost:4000 shows Firestore data and Auth users.

**Demo data.** `bun run seed` **wipes** the emulators and loads demo manifests, pieces, locations, carriers and two users:
- `admin / admin12345`
- `operator / operator123`

Run it the first time, and whenever you want a clean slate.

**Stopping.** Press `Ctrl+C` in each terminal. The emulators save their data to `.emulator-data/` and load it again next time.

## Testing on a phone

The camera only works over HTTPS (or on `localhost`). The phone only talks to the app, never to Firebase directly, so you only expose port 3000.

**HTTPS tunnel (any phone):**

```bash
cloudflared tunnel --url http://localhost:3000
```

Open the `https://….trycloudflare.com` address on the phone. A new address can take up to a minute to start working.

**Same Wi-Fi (Android Chrome):**
1. Run `bun run dev:lan`, then open `http://<pc-ip>:3000` on the phone.
2. On the phone, add that address under `chrome://flags/#unsafely-treat-insecure-origin-as-secure` and relaunch Chrome.
3. Allow port 3000 through the PC firewall.

Without a camera, the receiving and release screens have a typed-barcode box and, in development, a list of test barcodes (multi-piece, FedEx PDF417, DHL 3-barcode label, unknown item…).

## Tests

```bash
bun run test            # domain rules, carrier parsers, CSV import (no emulator)
bun run test:emulator   # needs `bun run emulators`
```

`test:emulator` runs three things:
- **`tests/server/services.test.ts`:** the transactional services. It covers duplicate receipts (including a parallel race), replayed operations, bulk store, manifests, merging and deleting.
- **`tests/server/budget.test.ts`:** runs a simulated day of 100 pieces and counts Firestore reads and writes against the free-plan target (see [Free-plan budget](free-plan-budget.md)).
- **`tests/rules`:** the deny-all security rules.

Before committing, also run `bun run typecheck`, `bun run lint` and `bun run build`.

## Troubleshooting

- **"port taken" when starting the emulators:** an earlier run is still alive. Close that terminal, or end the leftover `java` process in Task Manager.
- **Login says wrong username or password:** the emulators have no users yet. Run `bun run seed`.
- **Pages show an error right after starting:** the emulators aren't running. Start terminal 1.
- **"The app was updated. Reload the page":** the server restarted with new code while the page was open. Reload.
