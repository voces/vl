# IR: a hole-typed element read at its closed list's element (lane COV-CLOS, 2026-11-26)

`fs.map(apU)[0]`, where `apU(r)` returns a hole function's result, reads an element whose own
type is a hole: it has no rep, and the builder missed it (`rep unsup` of an index). The list the
IR holds is closed (the map builds it at the callback's result), so the read is at that list's
element rep (`openIndexRep`, `closedListElemTy`), as any open read takes its storage's rep.

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base and head at
master `903f71519`): `rep unsup` 3 → 2 (the position test's start claimed; the two left are
`hole-fn-list-named-callback.vl`'s start, below, and a call's, `viaReturn$1`, which
cov-clos-callrep closes). Claimed starts 8,433 → 8,434, claimed functions 97,867 → 97,867, claims
fallen back 16 → 16; 0 claimed functions or starts lost.

`VL_IR_REQUIRE_CLAIM=1 vl run` on the position test
(`tests/cases/closures/hole-typed-element-read-of-closed-list-positions.vl`: a mapped list bound
and indexed, indexed in arithmetic, mapped and indexed inside a function, a nested list's element
called): base fails (`rep unsup`), head runs with every body claimed; output identical claims-off
and on.

## Left open

`tests/cases/closures/hole-fn-list-named-callback.vl`'s start still misses `rep unsup` of an index.
It needs five of its sections together (`v`, `pushed`, `l`, `nested`, `rec` each mapped and indexed);
any four, or neutralising any one read, builds whole. Not traced.
