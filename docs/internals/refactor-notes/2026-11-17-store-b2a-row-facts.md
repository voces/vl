# B2a: the decider reads each call row's facts, 2026-11-17

Lane STORE, stage B2a of storage per (KeyId, parameter). The design is
`2026-11-17-store-b2-design.md`, which this PR carries. The coordinator's ruling of 2026-11-17 adds:
a set moves only when all its rows are complete and agree, and lambda members go to B3.

## What changes

**`check_arrow_facts.vl`.** `arrowFactsBuild` also builds facts from the call rows (`arrowRowFacts`).
- **Rows.** There is one row per recorded call (`instVecAt`), per un-annotated parameter, per set the
  argument holds. Its binding is `arrowRowBinding`, which keeps a set's identity, as B0's shadow does.
- **Facts.** A row notes one fact per call its callee makes through that parameter, or through a field
  or element path from it, whose callee holds the row's set. The fact is each member's result at
  argument types the row's binding substitutes.
- **When a row's facts stand.** A row's facts are noted only when the whole row is complete:
  - the binding closes;
  - no member is a lambda;
  - every such call's argument types close, and no argument is an empty list literal;
  - every collected call's path resolves on the row's type (a method off a list or map does not);
  - the parameter is read only as a callee path, as an argument to a declared function's
    un-annotated parameter, or as a returned value (`arrowReadPlain`), and is not read inside a
    nested function.
- **Incomplete rows** go to `afRowOpen` (`arrowSetRowOpen`). They do not mark the arrow facts' own
  open set.
- **Arrow rows.** An arrow row's open mark is dropped for a set that a complete row at the same outer
  call covers.
- **Diagnostics.** A member's result at a row's types is asked quietly: diagnostics recorded while the
  rows are built are rolled back.
- **Moved helpers.** The path and binding helpers moved here from B0's shadow (`check_inst_keys.vl`),
  which now calls them.

**`check_fn_tag.vl`.** `fnTagDecide` also tries each set a fact names. Such a set must have no open
row and no arrow-open call. A set whose class carries any of the following is left as before:
- S (B2b's);
- V;
- C;
- G, unless every fact of the set is at one argument vector holding no function (`arrowSetOneShape`),
  so each generic member has one instance;
- a parameter owner called through a set (A1.2's `ftParamOwnerCalledThroughSet`).

## The ablation that fixed the conditions

Measured as late rows gone, `untag` rows, and fixtures whose output changed:

| variant | gone | new `tag` | untag | regressions |
|---|---|---|---|---|
| facts only, no new try | 0 | 0 | 0 | 1 |
| plus the try of every fact set | 102 | 0 | 6 | 8 |
| plus annotated parameters out and S/V/C kept | 85 | 0 | 6 | 5 |
| plus a read that is no callee, argument or result makes a row unsure | 52 | 26 | 5 | 2 |
| plus row incompleteness kept apart from the arrow facts' open set, quiet results | 52 | 0 | 5 | 2 |
| G kept outright (control) | 3 | 0 | 3 | 0 |
| G kept unless one argument vector, an argument plain only to an un-annotated parameter | 17 | 0 | 5 | 0 |
| plus an unresolved callee path makes a row incomplete, and A1.2's owner test | 16 | 0 | 1 | 0 |
| plus an empty list literal argument makes a row incomplete | **16** | **0** | **0** | **0** |

The 26 new `tag` rows were sets the check had already decided. Marking incomplete rows in the
arrow facts' open set refused them; the fifth variant undoes that.

## Residue

`scripts/late-tags-baseline.txt`: 419 → 403 (13 G, 3 J), written from a fixpoint seed. No row is new.

Gone:
- `closures/choice-of-hole-fns-handed-to-open-param.vl` `J {str}`;
- `closures/generic-body-only-type-param-as-callback.vl` `G {idg}`, `G {k}`;
- `closures/hole-fn-if-to-hole-param.vl` `J {exclaim}`;
- `closures/hole-param-list-of-hole-functions.vl` `G {idT}`;
- `closures/record-of-named-fn-in-generic-field-written-with-named-fn.vl` `G {same}`;
- `closures/record-of-named-fn-in-generic-field-written-with-param.vl` `G {same}`;
- `closures/tagged-sets-of-one-signature-to-one-helper-keep-two-instances.vl` `G {g1,g2}`, `G {g1,g3}`;
- `closures/written-let-of-hole-fns-results-agree-at-hole-arg.vl` `J {half}`;
- `functions/generic-fn-value-two-type-param-params-at-two-types.vl` `G {also}`;
- `functions/generic-structured-param-through-hole.vl` `G {getx}`;
- `functions/generic-swapped-recursion-returning-scalar.vl` `G {same}`;
- `generics/generic-fn-to-hole-param-instanced-at-its-calls.vl` `G {pair}`;
- `generics/hole-call-of-generic-at-its-own-instance.vl` `G {same}`;
- `operators/identity-eq-generic-call-sites.vl` `G {same}`.

B0 put 219 late rows at complete with one shape. B2a moves 16, because the decider's other tests
still refuse most of them:
- 61 T sets have a lambda member, which is B3's;
- most G sets have two argument vectors, also B3's;
- the rest are refused by the holder rules after the facts are complete.

## Grading (fixpoint seeds both sides, master `8d1ecd6e9`)

- `vl check --codegen tests` (7,257 programs): output byte-identical apart from the late rows.
- `@run` A/B (6,705 programs): 0 output movers. 4 wasm movers, each printing the same output:

  | program | master → B2a |
  |---|---|
  | `closures/generic-list-written-called-through-generic-where-it-fits.vl` | 844 → 933 bytes |
  | `closures/record-of-named-fn-in-generic-field-written-with-named-fn.vl` | 470 → 482 |
  | `closures/record-of-named-fn-in-generic-field-written-with-param.vl` | 476 → 488 |
  | `closures/written-let-of-hole-fns-results-agree-delivered.vl` | 908 → 865 |

  The first and last have no late row on either side: the check now decides, from the rows, a set
  it left before, and the late decision agrees.
- Capability matrix, the 73 hole-fn, fn-list and generic-fn templates, `--before` master: 2,982 of
  3,780 run, 0 runs → not-runs, 0 → silent, 0 program traps.
- Late demands 10, unchanged.
- L2 self-compile fuel: 96.618G against master's 96.534G measured alike (+0.09%).
- `emit_mono.vl` functions 908; phase-state census ok; lint clean. Net compiler lines +431 / −156.
