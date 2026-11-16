# Rep ADT stage 3e, first piece: 3a's end-of-emit sweep is deleted, 2026-11-16 (lane REP)

[3a](2026-11-15-rep-adt-stage3a-shadow.md) compared each struct row field's stored code with its
storage type's derived code once, at the end of emit. Since [3c-i](2026-11-16-rep-adt-stage3c-read-shadow.md),
`fieldCodeIn` compares every read as it happens. Since [3c-ii](2026-11-16-rep-adt-stage3c-derived.md),
it derives the code, and it fails loudly under `$VL_REP_SHADOW` on a moved code or a kept read
outside the named classes. The per-row sweep, its minter labels and its template-row memo
therefore measure nothing the read-time shadow does not. They are deleted (−97 lines).
`fcShadowSweep` now only reports the read-time counts.

## The guard still fires

As a control, a scratch seed (never seeded into `build/`) stores `FC_STR` for any struct field
named `zz9`, a deliberately wrong code. It ran on `type T = { zz9: i32, b: i32 }`,
`const t: T = { zz9: 4, b: 5 }`, `print(t.zz9 + t.b)`.

| | |
|---|---|
| armed (`$VL_REP_SHADOW=1`) | `emit error`: "emitProgram: a field's stored code is not the one its storage type derives" |
| unarmed | prints `9`: the reader derives the code, so the wrong stored code never reaches emit |
| the pristine seed, armed | builds (178 bytes) |

The read-time guard catches what the deleted sweep caught.

## The rest of 3e is deferred

The rest of 3e makes the code consumers (`pushFieldStorage`, `fieldCodeKind`, `fieldCodeVKind`,
`listRepOfFieldCode`, `fieldCodeRefsElemHeap`, the `layout*` predicates) match on the rep. It
waits on the same dependency as [3c-iv step B](2026-11-16-rep-adt-stage3c-iv-anon-store.md): the
kept classes carry a code their rep does not give.
- D16720 hole rows: no rep.
- D16721 function fields: code is a closure or a set id.
- D16722 hole lists: no rep.

Done now, each consumer would need a second, code-keyed path for those rows. Once the classes
close (lane SLOT's slot-store stage 3 for D16720 and D16721, this lane for D16722), 3e collapses
the consumers in one pass.

Only shadow code is deleted, so the unarmed compiler emits the same bytes. The gate's
distilled-corpus row re-checks that.
