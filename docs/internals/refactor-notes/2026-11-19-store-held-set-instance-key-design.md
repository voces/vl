# STORE: an instance key for a hole handed a holder of a tagged set (2026-11-19)

The coordinator assigned this after D15900 parked. #9051 keys a hole by a function value's identity
set; this stage keys it by the set a handed record or list holds. D15900 is the witness. The pinned
refutation: tagging D15900's set without the key builds an invalid module.

## The witness and the refutation, measured on master 7c2cd2a8f
```
function id(x) { return x }
const xs = [{ f: id }]
function twoSigs(k: i32) { print(xs[k].f(2) + xs[k].f(2.5)) }
twoSigs(0)
function take(a) { print(a[0].f(2.5)) }
take([{ f: id }])
```
- Master refuses at emit: "a function value is called at two signatures, and the closure it holds
  was built for one". The set `T {id}` is refused at check and late. Its retry stops at `ftCtxOk`'s
  FieldInit arm for `id` in the handed literal, because neither `ftRecHolds` nor `ftOpenFieldHolds`
  holds: `take`'s parameter is a bare hole, bound to the literal's own type.
- With the decision admitting it (`ftHandedRecHolds`: a record literal, through list literals, at a
  declared function's un-annotated parameter holds `s` in its own type, held to D15641's
  same-shape rule at check), `T {id}` is tagged. The program then fails validation in the module's
  top-level code: `expected (ref $5), found i32; $5 is struct {structref, i32, i32}`. `id` is
  emitted as the set's id, but the handed literal is built at `take`'s instance parameter type, a
  list of closure records.

So the decision half is small and known. The gap is the elaboration's key for `take`'s instance:
it is the literal's closure-record type, not that type with its function leaf carrying the tagged
set.

## Where the keying lives
- **The check-side shadow** (`check_inst_keys.vl`, `ikRowTys`/`ikIdTy`) carries an identity set only
  where the hole's own bound type is a function type (#9051).
- **The elaboration's held-type helpers** already give a held type's function leaves their sets
  (`elabHeldKeepSets`, D15296; `elabHeldValTy`) for values built in a frame. They are not applied to
  a hole's binding at a call.
- **The partiality test after the mint** (`emit_elab.vl` ~4180) has per-shape exemptions:
  - `elabKeyCallsHandSet` (G2e): a member handed by name;
  - `elabKeyCallsHandSetValue` (D15622);
  - `elabKeyCallsHandClosure`;
  - `elabKeyCallsHandRecClosure` (D15646): a record or list literal holding closures outside the set.
  There is no twin for a record or list literal holding the set's own members.

## Plan
1. Key the hole: where the elaboration binds a hole parameter from a call's argument, a record or
   list literal argument whose function leaves are members of a tagged set binds at the literal's
   type with those leaves carrying the set (`elabHeldKeepSets` over `idSetOf` of each leaf). The
   instance is then the set's rep, as #9051 makes it for a bare function value. Mirror it in
   `ikIdTy` so the A0 shadow (`VL_INST_KEYS`) adds no elab-only key.
2. Add the D15646 twin to the partiality test: every call hands, at the path `c` calls through, a
   record or list literal holding only members of `c`'s set, so the set is not partial.
3. Land the decision half (`ftHandedRecHolds`) in the same PR, never before 1 (the pinned refutation).

## Grading
D15900's witness and its spellings from the row (an argument, a return, a record field, a list
element; the "handed-unused" spelling), plus F2's spellings: the second literal bound (runs on
master), not handed on, and handed a scalar. Bars:
- nets 20 and 40 stay at 0;
- no new A0 elab-only keys (`VL_INST_KEYS`);
- late rows do not rise;
- a full @run A/B.

## What shipped
The key itself was already right once #9107 landed: `elabCallArgSetTy` reads the handed literal's
own type, which holds the tagged set, so `take`'s instance is keyed `{f: (_) => _}[]#4`. Plan step 1
needed no `idSetOf` read, and step 2 (the partiality twin) was not reached. What failed was
everything after the key:
1. **Mono pinned the hole at the closed closure type** (`monoPinHoleParam`). Its held refinement
   took the bound set-holding type only for a list of ids. It now also takes a list literal of
   records holding the set's ids, and pins at the list of their stored rows (`monoTagMapRepTy` of
   the element). `monoMakeInstanceParams` types that pin as the set-holding list itself, as it does
   a record of ids. A bound list keeps its own literal's rows:
   `list-of-records-of-hole-fns-handed-to-open-param.vl` stores closures under a tagged set.
2. **A second clone of the call lost its set** (`monoTagSetAt`). The first clone, inside the
   instance's walk, carries the set and its arms (`fnTagCallCopy`). The clone of that clone read
   its callee's closed type, `(f64) => f64`, and returned -1. A clone that carries a tagged set with
   arms now keeps it.
3. **The handed literal was built at the closure record.** `ftP.named` stamps a record at its own
   rep only in the late pass. A handed record, and each list literal around it
   (`ftHandedListsNote`), is now stamped when the decision takes it.
4. **The decision is narrowed** to what the facts can hold. A record handed bare (no list literal)
   regressed `hole-fn-record-field-called-at-other-param.vl`, so that spelling stays refused, as on
   master. A callee named twice (`use5` in `hole-fn-record-list-literal-beside-shared-field-record.vl`)
   met "an instance call ... meets a key those facts lacked" at check, and added two late rows when
   decided late, so the callee must be named once (`ftFnReadCount`, counted in the walk
   `ftShapeLitsOf` already makes).

## Measurements (fixpoint seeds: master `0fffbbb4c`, this branch)
- @run A/B over 6,777 cases: one mover, the new fixture
  `closures/record-literal-of-a-tagged-set-handed-to-a-hole-param.vl` (emit refuses → runs).
  0 runs → not-runs, 0 wasm-only diffs.
- Late demands 9 (baseline 9); late tag rows 307 (baseline 307).
- A0 shadow (`VL_INST_KEYS`): elab-only keys identical per file, 7,793 over 6,780 files.
- `record-list-hole-fn-lone-use-beside-two-signatures.matrix.vl`: `argument` un-annotated moves to
  RUNS; 0 runs → not-runs, 0 silent. The other 22 cells (returns, fields, list elements, locals,
  map values, and the annotated argument) are still refused, and D15900 stays open on a return witness.
