# Free-plan budget

Firestore stays on the free **Spark** plan. Spark can't charge anything. When a daily limit is used up, Firestore stops answering until the reset, so the app would stop saving mid-shift. The design keeps well under the limits even at **twice** the expected volume.

## Limits

| Resource | Free per day |
|---|---|
| Document reads | 50,000 |
| Document writes | 20,000 |
| Document deletes | 20,000 |
| Stored data | 1 GiB total |

The daily counters reset at **midnight US Pacific time, about 10:00–11:00 in Kuwait**.

## Measured usage

`tests/server/budget.test.ts` runs a simulated day through the real services and counts billed operations. The day is 100 pieces in 5-piece shipments: manifest, receive (lookup and confirm), store, release scan (lookup and scan), outcome, and dashboard views.

| | Per piece | 1,000 pieces/day | At 2× | Free limit |
|---|---|---|---|---|
| Writes | 5 | ~5,000 | ~10,000 | 20,000 |
| Reads | ~19 | ~19,000 | ~38,000 | 50,000 |

**Why reads are the bigger number:** a scan lookup returns every piece of the shipment, because the piece picker needs them. A 5-piece shipment therefore costs 5 reads per scan, at receiving and again at release. Shipments with fewer pieces cost less. The manifest-header cache saves about one more read per scan in production (the test can't see the cache).

Screens add a little on top:
- the Store list (≤ 100 reads per open),
- the release picking list (≤ 150 per session),
- admin lists.

## The rules that keep it low

1. **One document write per action.** There are no counter documents; they would double the writes.
2. **Counts use count queries,** which cost 1 read per 1,000 matches, and are cached for a minute and shared by all users.
3. **Exact lookups** (`carrier + item ID`) and **bounded lists.** No live listeners, no polling.
4. **Shared caches** for carriers, locations and manifest headers, cleared only when an admin changes them.
5. **Barcodes are parsed on the phone first.** Frames that only show non-item barcodes (such as DHL's routing code) never reach the server.
6. **Archive after export** keeps stored data far below 1 GiB, at about 3 KB per piece including indexes.

## Checking usage

Use **Firebase console → Firestore → Usage**. It shows today's reads, writes and deletes for free.

The in-app usage meter (Admin → System, with a warning banner at 80%) is **switched off**:
- **Why:** its numbers come from Google Cloud Monitoring, which only answers projects with billing turned on (Blaze). This project stays on the free Spark plan.
- **Bringing it back:** the code is commented out, not deleted. Search the code for `USAGE METER (disabled)` and uncomment each place. Then give the service account the **Monitoring Viewer** role in Google Cloud IAM.
