# Using the app

The app is in Arabic by default. Switch to English from the user menu (or on the sign-in screen); the choice is kept per phone. Item data such as IDs and names always stays in English.

On a phone, the bottom bar shows **Dashboard, Receiving, Store, Unidentified, Release**. Admins get **Admin** in place of Unidentified, which is still in the side menu. Everything else is in the side menu (☰).

## Dashboard

Shows what needs doing, most urgent first: pieces waiting to be stored, pieces ready for the release scan, today's receipts, unidentified items, and (for admins) items waiting for an outcome. Tap a line to open the screen where that work is done. The numbers can be up to a minute old.

## Receiving

1. **Pick the carrier.** One tap on the carrier's button starts the session. The date is today; tap *Edit* to change it. The phone remembers the session until you change it.
2. **Scan.** The camera starts by itself. Point it at the label.
   - **FedEx:** scan the big square barcode (PDF417), not the lines barcode.
   - **DHL:** the label has three barcodes. The app uses the 10-digit waybill and ignores the others.
   - If the camera can't read a label, type the barcode in the box under the camera.
3. **Check and confirm.** A dialog shows the shipment. Compare the consignee and quantity with the label (*More details* shows the rest).
   - Pick the piece number (e.g. 2/5). Pieces already received are crossed out and can't be picked.
   - Choose **Store in warehouse (location later)** or **Direct release (not stored)**.
   - Tap **Confirm received**. There is no second "Are you sure?".
4. **If something is wrong:**
   - **Does not match** records the piece as unidentified instead.
   - **Label quantity is different** flags a quantity mismatch for the admin.
   - **The ID is in several manifests:** you choose which one.
   - **The barcode isn't in any manifest:** you record it as unidentified. Copy the label details; later pieces of the same shipment join the same group.

The header shows today's progress for the carrier (received, and still expected). *Recent scans* lists what you did this session; a cloud icon means it is still waiting to send.

## No signal

Receiving, storing and release scans work with a weak signal:

- **If the signal drops when you confirm,** the action is kept on the phone and sent automatically when the signal returns. The header shows *N waiting to send*.
- **If the server refuses it later** (for example, someone else received the same piece first), it shows as *not accepted* with the reason. Tap the chip to retry or remove it.
- **Looking up a barcode always needs signal.** Without it the app says so; try again when the signal is back.

## Store

Received pieces wait here for a location.

1. Tick a shipment to select all its pieces, or tap single pieces (e.g. 3/4).
2. Tap **Choose location** in the bar at the bottom.
3. Turn the three wheels (warehouse, rack, position), or tap one of your recent locations. The wheels start on the last location you used.
4. Tap **Store N here**.

Use **Refresh** to see pieces received by others since you opened the screen.

## Release

1. **Pick the carrier.** The list on the right shows every piece ready to release, sorted by location, so you can collect them in one walk.
2. **Scan each piece you collected.** Pick the piece in the dialog, then tap **Confirm release scan**.
3. **The admin records the final outcome** afterwards (below).

A piece that was received but not stored yet can't be release-scanned. Store it first, or receive it as direct release.

## Admin

**Release outcomes**
- Select release-scanned pieces and choose *Released*, *Repossessed* or *Seized*. The date of release is shown in the confirmation.
- Unidentified pieces need the extra, irreversible step *Mark identified and release*.

**Unidentified**
- Set the investigation status and a note.
- Search an expected manifest piece by the start of its ID and **match** the unidentified piece to it. The manifest piece becomes received and keeps the unidentified piece's location and date.

**Manifests**
- The newest manifests are listed first, each with a progress bar (received out of total).
- Search by the start of the name (e.g. `TNT-10-8`).
- *New manifest*: type the lines or import a CSV. The name is generated as `<Carrier>-<M-D-Y>-<Truck>`, and you can edit it.
- On a manifest, pieces that were never received can be deleted.

**Items**
- Open any piece to see its separate states (received, stored, released) and times.
- Admins can correct the data or clear a mismatch flag.

**Configuration**
- **Locations:** add one rack at a time: warehouse (WH1), the rack's letter (any letter, e.g. K) and the first and last numbers on that rack (1–40), up to 500 per add. Locations can be disabled but are never deleted.
- **Carriers:** see [Carriers and barcodes](carriers-and-barcodes.md).
- **Users:** create accounts, reset passwords, change roles, disable users.

**Export**
- Choose a date range, preview, then download CSV or JSON.
- After the file is safely stored, released, repossessed or seized pieces can be archived (deleted from the system) to keep storage small.

**System**
- Shows which backend the app uses and this phone's waiting scans. For free-plan usage, see [Free-plan budget](free-plan-budget.md).
- *Reset this phone* clears saved sessions and lists.
