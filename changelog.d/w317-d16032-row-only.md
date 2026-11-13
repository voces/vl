## Codegen, memory & runtime (Track B)

- **Step 7, D16032: the member-set readers read the row only.** With the hole binding's box carrying its row (#7877), `msSetOfRowOr`'s name fallback resolved nothing in the population. All 13 calls now read `msSetOfRow(row)`, and `msSetOfRowOr` is deleted. All 4,772 programs that reach the converted sites build byte-identical.
