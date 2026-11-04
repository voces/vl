# A bundle's record as a value — design, 2026-11

D15144's slice B. A parameter called at two signatures holds a record with one closure per
signature (the bundle, D14841). Until now the record lives in exactly two places:

* a bundle parameter;
* a call expression whose callee returns one (#6070, D15142 slice A).

At the call expression the caller picks one member at once. This note is about letting the
record itself be held, called and handed on. It covers the position matrix the capability needs
before any code, as `CLAUDE.md` asks of a capability gap: build the lowering, wire every
delivery, then narrow the refusal.

Status: draft, docs only. Nothing here is built.

## Where the record is today

| Holder | Who decides | Read by |
| --- | --- | --- |
| bundle parameter | elab `elabCallBundleSigs` → mono `monoBundlePin` | `bundleSigsOfParam`, `emitBundleCall` |
| handed-on parameter, own or captured | elab `elabCallHandOwner` → mono `monoBundleKeyTys` | `monoBundleHandOnPin` |
| a one-closure parameter's member | elab `elabCallHandMember` | `emitBundleMemberArg`, both call arms |
| a returned record's member | elab `elabCallResultMember`, `elabHolderMemberTy` | `emitBundleResultPick`, `cloCallSigKey` |

Every row has one shape: elab owns the fact, mono records only what it built, and emit reads.
Slice B keeps that shape.

## What slice B adds

**A record-holding value.** A binding, slot or result whose value is the record, typed at the
record's struct row. It gets the same per-call member selection a bundle parameter has.

* **The fact** (elab): for each holder, the record's signatures in field order, keyed per
  instance (the D15145 fix rides on this). A holder is a binding declaration, or a
  (container slot, instance) pair once containers are in scope.
* **Producers**, the values that can deliver a record:
  * a bundle parameter's read;
  * a call returning one;
  * a holder's read;
  * a lambda literal or a named generic delivered where the destination's fact says record
    (built at each signature, as `emitBundleArg` does for a parameter).
* **Consumers**, the uses of a holder:
  * a call through it picks the member at the call's closed argument types. This
    generalises `bundleCallSig` from parameters to holders.
  * a hand to a bundle parameter at the same signatures passes the record.
  * a hand to a one-closure parameter passes the member (the D15140 path).
  * any other use is a position below.
* **What it does not do.** A closed closure cannot become a record: `(i32) => i32` has no
  `(f64) => f64` member to build, and the checker already refuses calling it at `f64`. So a
  write into a record holder must itself be a producer. A plain closure written into one is a
  loud refusal, never a conversion.

## The position matrix

The positions are `scripts/capability-matrix.vl`'s, which grades each in an annotated and an
un-annotated face. "Today" is measured by hand on master `e43c62c6` (one program per cell, the
un-annotated face); a cell marked "not graded" has no witness yet, and the template below
grades every cell in both faces first. Slice B1 is the first PR,
B2 the second, and "refuse" means a positioned loud emit refusal that a row then tracks.

| Position | What it needs | Today | Slice |
| --- | --- | --- | --- |
| `binding` (`const r = lap(...)`, two signatures) | a holder fact, member per call | loud (D15144 witness) | B1 |
| `binding`, one signature | — | runs (D15142 pin) | done |
| `closure_capture` | a captured holder reads the record; calls pick | one signature runs; two refuse | B1 |
| `argument`, to a bundle parameter | pass the record when the signatures match | loud (D15144 grading list) | B1 |
| `argument`, to a one-closure parameter | the member (`elabCallHandMember` keyed by holder) | loud | B1 |
| `return_inferred` / `return_annotated` | the function returns the record (`monoReturnedBundlePin`, from a holder) | a holder returned again refuses | B1 |
| `local_assign` (`let r = …; r = …`) | the written value must be a producer at the same signatures | refuses | B1 |
| `two_instances` (holder in a generic caller) | the holder fact keyed per instance | loud (D15145) | B1 |
| `fn_body`, `fn_body_capture`, the `block_*` rows | as `binding` and `closure_capture`, scoped | not graded | B1 |
| `is_in_*`, `else_if`, `early_return_guard` | a narrowing guard over the holder's read; no new rep | a read inside an `if` runs at one signature; the rest not graded | B1 |
| `global_init`, `global_assign` | a module global at the record's row; its own instance key is -1 | `global_init` runs at one signature (slice A's pick); two not graded | B2 |
| `struct_field_init`, `struct_field_assign`, `struct_field_place` | a record-typed field: the field's slot fact, and a row whose field is the record | not graded | B2 |
| `array_element`, `array_element_assign`, `array_push`, `array_element_place` | a list whose element is the record; a list of mixed records and closures refuses | `array_element` refuses; the rest not graded | B2 |
| `map_value`, `map_set`, `map_value_place` | as the list rows, for a map's value | not graded | B2 |

B2's containers are a separate PR because their slot is a type, not a declaration. A slot fact
needs the container's row to carry a record-typed field, and that touches the rep layer
(`scripts/rep-fuzz-check.sh` becomes mandatory). B1 touches no rep.

## Order of work

1. **Template first.** Write `matrix/returned-bundle-record.matrix.vl`. Its prelude is `lap`
   calling `f` at `(f64)` and `(i32)` and returning it; its value is `lap((a) => a + k)`; its
   proof prints `r(4)` and `r(1.5)`. Grade it on master; that table replaces the "Today"
   column above.
2. **Generic twin.** Write `matrix/returned-bundle-record-generic.matrix.vl` with the value
   delivered through `function mid<T>(x: T)`, so the holder sits in an instance. Without it the
   matrix annotates for us: every cell above would be a root holder, and D15145's shape would
   never be graded.
3. **B1**, as the table says:
   * elab: the holder fact per instance; the per-call member for calls through a holder; the
     producer check for writes.
   * mono: a holder binding's slot is pinned at the record's row, from the fact.
   * emit: a call through a holder selects the member; a holder's read handed on follows the
     parameter rows; any other use refuses positioned.
   * Narrow D15142 slice A's "result is not used at one of them" refusal only after every B1
     row passes in both faces.
4. **B2**, containers, under `rep-fuzz-check.sh`.

## Acceptance

* Both templates graded before and after with `--before`/`--after`: no `runs → not-runs`, no
  `SILENT` cell, and every B1 row `RUNS` in both faces.
* D15144 and D15145 close. The B2 rows file as rows until B2 lands.
* Sweeps with the split plan on and off show only pins moving. Late demands 0. Fixpoint.
* The holder fact is elab's: mono writes no type onto a holder, and emit decides no member.
