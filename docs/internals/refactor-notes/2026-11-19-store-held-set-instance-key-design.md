# STORE: an instance key for a hole handed a holder of a tagged set (design, 2026-11-19)

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
