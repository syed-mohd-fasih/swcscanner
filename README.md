# SWC Scanner

A warehouse receiving and release app for phones. Operators scan carrier barcodes with the phone camera, check each piece against the manifest, put it away at a location, and later scan it again to release it. Admins enter manifests, manage locations, carriers and users, look into unidentified items, and record the final release outcome.

The app runs on Next.js and Firebase. The phone only scans and shows screens. The server does all the work and stays within the free Firestore plan.

**Version 0.2.0**, the server-first version. See [docs/changelog.md](docs/changelog.md).

## Quick start (local, no Firebase project needed)

Needs [Bun](https://bun.sh) 1.4+ and Java 11+ (for the Firestore emulator).

```bash
bun install
bun run emulators      # terminal 1: leave running
bun run seed           # terminal 2: demo data (wipes the emulators)
bun dev                # then open http://localhost:3000
```

Sign in as `admin / admin12345` or `operator / operator123`.

## Documentation

| Page | For |
|---|---|
| [Using the app](docs/workflows.md) | Operators and admins: receiving, storing, release, outcomes, unidentified items, manifests |
| [Running locally](docs/development.md) | Emulators, demo data, phone testing, tests, troubleshooting |
| [Deployment](docs/deployment.md) | Firebase project, Vercel, environment variables, first admin |
| [Architecture](docs/architecture.md) | How the server-first design works: data layer, transactions, retry queue, security |
| [Free-plan budget](docs/free-plan-budget.md) | Firestore limits, measured usage, how to check usage |
| [Carriers and barcodes](docs/carriers-and-barcodes.md) | Parsers, FedEx PDF417, multi-barcode labels (DHL), adding a carrier |
| [Changelog](docs/changelog.md) | What changed in each version |

## Scripts

| Script | What it does |
|---|---|
| `bun run dev` / `dev:lan` | Dev server (LAN variant for phones) |
| `bun run emulators` | Firebase emulators, keeping data in `.emulator-data/` |
| `bun run seed` | Reset the emulators and load demo data |
| `bun run test` | Unit tests (domain rules, parsers, CSV import) |
| `bun run test:emulator` | Server and security-rules tests, including the budget check (needs `bun run emulators`) |
| `bun run typecheck` / `lint` | Type check and lint |
| `bun run deploy:firestore` | Deploy rules and indexes to the real project |
| `bun run setup:cloud` | First admin and carriers in the real project (never deletes) |
