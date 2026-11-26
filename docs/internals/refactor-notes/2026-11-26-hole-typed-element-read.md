# IR: a hole-typed element read at its closed list's element (lane COV-CLOS, 2026-11-26)

`fs.map(apU)[0]`, where `apU(r)` returns a hole function's result, reads an element whose own
type is a hole: it has no rep, and the builder missed it (`rep unsup` of an index). The list the
IR holds is closed (the map builds it at the callback's result), so the read is at that list's
element rep (`openIndexRep`, `closedListElemTy`), as any open read takes its storage's rep.

## Measurements

MEASUREMENTS_PLACEHOLDER

## Left open

`tests/cases/closures/hole-fn-list-named-callback.vl`'s start still misses `rep unsup` of an index.
It needs five of its sections together (`v`, `pushed`, `l`, `nested`, `rec` each mapped and indexed);
any four, or neutralising any one read, builds whole. Not traced.
