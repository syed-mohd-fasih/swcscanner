/**
 * FedEx PDF417 payloads with the exact structure of real FedEx Express labels
 * (see docs: client sample scans). Personal data — names, phones, addresses,
 * tracking/account numbers — is replaced with fake values.
 */
const RS = "\x1e"
const GS = "\x1d"
const FS = "\x1c"
const EOT = "\x04"

/** Single piece: tracking 794600001111 (label form code 0430). */
export const FEDEX_SINGLE_PIECE =
  `[)>${RS}01${GS}02000${GS}414${GS}04${GS}7946000011110430${GS}FDE${GS}100000001${GS}260${GS}${GS}1/1${GS}8.00KG${GS}N${GS}` +
  `Shuwaikh Industrial Area${GS}Kuwait City${GS}  ${GS}TEST CONSIGNEE ONE` +
  `${RS}06${GS}10ZEII08${GS}12Z96500000001${GS}14ZTest Complex - Bld. 1${GS}15Z200000001${GS}` +
  `31Z1072424942660011039900794600001111${GS}32Z022883${GS}39ZTEST${GS}` +
  `99ZEI0006${FS}ES${FS}311${FS}KUD${FS}SOAP DISPENSERS${FS}${FS}${GS}` +
  `${RS}09${GS}FDX${GS}z${GS}8${GS}\x10\x01&667@${RS}${EOT}`

/** Piece 4 of 5: piece tracking 794600002222, master tracking (28Z) 794600009999. */
export const FEDEX_MULTI_PIECE_4_OF_5 =
  `[)>${RS}01${GS}02000${GS}414${GS}2P${GS}7946000022220441${GS}FDE${GS}100000002${GS}271${GS}${GS}4/5${GS}2.00KG${GS}N${GS}` +
  `PO Box 1, 13002 Safat, Kuwait${GS}Safat${GS}  ${GS}TEST CONSIGNEE TWO` +
  `${RS}06${GS}10ZEII08${GS}11ZTest Automotive Trading C${GS}12Z96500000002${GS}15Z200000002${GS}` +
  `28Z7946000099990430${GS}31Z1241877254270011013900794600002222${GS}32Z02${GS}39ZTEST${GS}` +
  `99ZEI0006${FS}CN${FS}1331${FS}KUD${FS}Bolt for bus${FS}${FS} ${GS}` +
  `${RS}09${GS}FDX${GS}z${GS}8${GS}\x10\x0f#02?\x7f@${RS}${EOT}`

/** What a FedEx 1D scan yields — must be rejected in favour of the PDF417. */
export const FEDEX_1D_SUBPIECE = "1241877254270011013900794600002222"
