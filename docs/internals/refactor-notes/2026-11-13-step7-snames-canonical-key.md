# The canonical-key test over the struct-row label table, and D16002, 2026-11-13

Lane A. The struct-row label table (`sNames`, looked up by `structIndexByName` through `sNameIx`)
holds labels minted in two forms: a nominal brace spelling and an emit render. Lane F's deletion
of `shapeWalkKeyOf` waits on whether that key is canonical. Method as in
`2026-11-13-step7-canonical-key-tests.md`, plus a lookup check: every `structIndexByName` call,
with its name resolved back to a type in the probe only.

**Lookups pass** (24,215 programs):
- no lookup lands on a row of a different type;
- no lookup misses a type that has a row;
- no label names two types.

Minting the label from the type therefore changes nothing any lookup finds.

**The table.** 1,696 same-type pairs in 411 programs carry different labels. `structIndexByName`
canonicalizes through `sRowCanonOf`, and 395 of those programs collapse onto one canonical row:
- declared twins (`Buf` / `F32View` / `I32View`);
- every brace-versus-declared pair (`{r:i32}` / `R`, 31 programs);
- most `#anon` pairs.

Of the 15 that stay on two canonical rows, 14 are the hole/closure coarseness class: the rows hold
closures or hole-typed fields of different storage, and their recorded types compare equal only
because the hole types are unpinned. The fifteenth was `R1`/`R2` in
`nested-union-layer-field-crosses-to-flat`, filed and closed here as D16002. Its rows now fold, and
the remaining 14 are exactly the coarseness programs.

**D16002.** `fnSetsAgree`, the function-set half of `sRowElemRepSame`, compared a union's members
by position, so `(i32 | string) | f64` and `i32 | string | f64` disagreed. It now flattens nested
union layers and compares the members as a set. `fnSetsAgree` has no caller outside the row-twin
check.
