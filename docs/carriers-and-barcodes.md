# Carriers and barcodes

## Carriers

Admins manage carriers under **Admin → Carriers**. A carrier has:
- **a code,** used in manifest names, e.g. `TNT`;
- **a name;**
- **a barcode type:** *Normal barcode (lines)* or *FedEx (PDF417)*;
- **an optional item ID barcode pattern** (below).

The codes created by `setup:cloud` (FDX, TNT, ARX, DHL) are placeholders. Change them to the client's real codes.

## How a scan is read

The camera reports **every barcode in view**. On Android Chrome it uses the phone's built-in reader; on other browsers it uses the ZXing decoder, which is only downloaded when needed. `resolveScans` (`carriers/index.ts`) then picks the item barcode:

1. **Parse.** Each barcode is parsed with the session carrier's parser.
2. **Filter by the carrier's pattern.** Barcodes that don't match it are dropped. Typed barcodes are always accepted.
3. **Nothing left?** The scan is ignored silently (no beep, no dialog) and the camera keeps looking.
4. **Look up the rest** on the server. The first candidate with matching pieces wins; if none match, the operator records an unidentified piece.

This all happens on the phone except the lookup, so stray barcodes cost nothing.

## Labels with several barcodes (DHL)

A DHL label carries three barcodes: a routing code (`2LKW:…`), a piece ID (`JJD…`) and the 10-digit waybill. Manifests use the **waybill**, so DHL's pattern is `^\d{10}$` (exactly 10 digits). The carrier dialog has a box to test a value against the pattern.

TNT and Aramex labels are believed to carry a single barcode, so they need no pattern. Not yet confirmed with the client: if a stray barcode shows up, add a pattern.

## FedEx PDF417

FedEx sessions read the big square **PDF417** barcode (`carriers/fedex/fedexPdf417.ts`). There is no OCR; the barcode data itself is parsed (ANSI MH10.8.3):

| Data | Where |
|---|---|
| Tracking number | record 01, field 4: 16 digits = 12-digit tracking + 4-digit form code |
| Piece n/total | record 01, field 9 (pre-selects the piece number) |
| Weight, consignee | record 01, fields 10 and 15 |
| Master tracking (multi-piece) | record 06, `28Z`, which matches the printed *Mstr#* |
| Description | record 06, `99Z` |

On a multi-piece shipment, the **master** number is the item ID, so all pieces group together. Lookups accept the 12- or 16-digit form. Scanning the lines barcode on a FedEx label shows "scan the big square barcode".

**Still to confirm with the client:**
- that `28Z` is always the master on multi-piece labels;
- whether manifests list 12- or 16-digit numbers.

## Adding a parser or format

| What | Where |
|---|---|
| New label format | Add a `CarrierParser` in `carriers/` and register it in `getParser`, plus its id in `PARSER_IDS` (`domain/carriers/types.ts`). |
| Client's manifest file format | Register a `ManifestImporter` in `services/import.ts` (a generic CSV importer exists). |
| Client's export format | Add an `ExportFormat` in `services/export.ts` (CSV and JSON exist). |
