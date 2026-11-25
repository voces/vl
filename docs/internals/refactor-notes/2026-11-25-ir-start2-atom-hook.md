# START-2: `pre-path atom hook` (2026-11-25)

Census restricted to the class's eight programs (COV-START's list), master d08f4b13.

| class | before | after |
|---|---:|---:|
| pre-path atom hook | 8 | 0 |
| closure argument box (moved in) | 0 | 2 |

Start bodies claimed: 6 of 8 (before: 0 of 8).

The IR built the hook's node only in `deliver` at a bare atom destination. Three paths reached it
otherwise, one commit each:
- map operations: the plain-arm map value (`mapSetValue`) and every key (`mapKeyAt`, now given
  the receiver for its key type) went through `irBExpr`;
- a `K | null` destination: built at `K`, then widened as `widenTo` widens any atom;
- an open destination (a hole lambda's parameter): built at the node's own atom rep. The two
  hole-lambda programs (`closures/lambda-narrowed-literal-arg.vl`, D3076) then refuse on
  `closure argument box`, the parameter's open rep, which is COV-CALL's.

Found on master while sweeping, not fixed here (coalesce family): `n ?? Z` with `n: K | null` and
`const Z = "zz"` is check-clean and refuses at emit, "`??` over this nullable value is not
supported yet"; with a `K`-typed default it runs.
