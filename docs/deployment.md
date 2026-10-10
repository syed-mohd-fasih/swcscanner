# Deployment

**Production setup:**
- **Firebase project:** `swcscanner` (Auth plus Firestore in `me-central2`, on the free Spark plan).
- **Hosting:** Vercel, with functions in region `bom1`, set in the Vercel dashboard.

## The service-account key

This key is the server's password to Firebase. The server uses it to sign people in, read and write data, and manage users. Anyone holding it has full access, so:

- Keep the JSON file outside the repo. `.gitignore` blocks `*firebase-adminsdk*.json` anyway.
- Never paste it anywhere public.
- If it leaks: Firebase console → Project settings → Service accounts → delete it and generate a new one, then update Vercel.

## One-time Firebase setup

Needs `bunx firebase login` first.

```bash
bun run deploy:firestore
```

This deploys the deny-all rules and the indexes. Indexes take a few minutes to build.

Then create the first admin. In PowerShell:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\swcscanner-firebase-adminsdk-….json"
bun run setup:cloud admin 'a-strong-password'
```

`setup:cloud` creates the first admin and the carriers. It never deletes anything and is safe to run again. Then sign in as the admin and add the warehouse locations and operator accounts.

**Never run `bun run seed` against the cloud.** It is for the emulators only and wipes data.

## Vercel

Import the GitHub repo. Vercel detects Next.js, and uses Bun because of `bun.lock`.

Under **Settings → Environment Variables** (Production), add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` | `false` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `swcscanner` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | the web API key from Firebase console → Project settings |
| `FIREBASE_CLIENT_EMAIL` | `client_email` from the key JSON |
| `FIREBASE_PRIVATE_KEY` | `private_key` from the key JSON: the whole `-----BEGIN PRIVATE KEY----- … -----END PRIVATE KEY-----` block, without quotes |

**About these variables:**
- Despite the `NEXT_PUBLIC_` names, the browser no longer uses any of them; only the server reads them. The names stay as they are so existing Vercel settings keep working.
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` and `NEXT_PUBLIC_FIREBASE_APP_ID` are no longer needed and can be removed.

Redeploy after changing variables. Every push to the production branch deploys again.

**Things to know:**
- **Hobby plan:** Vercel's free Hobby plan is for non-commercial use only.
- **`jwks-rsa` is pinned to 3.x** in `package.json` (`overrides`). Version 4 doesn't load on Vercel's runtime.
- **Preview links** (one per deploy) ask for a Vercel login. Share the production address.
- **Tunnel origins:** server actions accept the tunnel hosts listed in `next.config.ts`. If you serve the app from a new custom domain behind a proxy, add it there.

## Local `.env.production`

`.env.production` (git-ignored) holds the same three `NEXT_PUBLIC_…` values. It is only used by `bun run setup:cloud` and local production builds.
