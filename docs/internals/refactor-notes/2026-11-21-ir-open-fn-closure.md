# IR: an open function type at the uniform closure rep is held (2026-11-21, lane IR-D1)

Coordinator ruling, 2026-11-21: take the `open temp type` / `open local type` / `open parameter
type` family. One PR holds the rule change and the fix for the mismatches it exposed.

## The family, by ablation

Rule 1 (`irTyHeldOpen`) used to hold a type with an open part only when each open part was a
function type at a tagged set's `i32` id. A debug compiler named the type at each miss over
tests/cases. All 1,850 rows (685 of 7,633 files) are an open function type, alone or inside a
list, record or map, held at the `closure` rep. The open part comes from:

- a hole (an unannotated lambda parameter, `(_) => _`): 1,258 rows;
- a generic used as a value (`() => id` : `() => ((T) => T)`): 590 rows;
- both: 2 rows.

Minimal witness: `const k = (x) => x + 1; print(k(3))`. `@start` misses `open temp type`.
- Annotating `x: i32` claims it.
- Dropping the call keeps the miss: a call never closes the binding's type.

## The change

- `tyOpenHeldAt` holds a function type at `RClosure` (or its nullable): `closureHeld`.
- Closure calls take their signature from legacy's plan at the call (`callRefPlainKey`), not from
  the type. A node whose lowering would read the open part stays a named miss (ir-design §1.1).
- The closure rep is uniform only while no instance makes a record of closures. A bundle (one
  lambda called at two signatures) is one closure per instance. A probe without that guard gave
  53 `prefix or locals` mismatches in 28 files, all bundle shapes, and a shipped claim would have
  written them. So `closureHeld` also requires `!elabMakesClosureRecords() && !bundleAnyParam()`.
  This is build-wide, so a program with any bundle keeps the old rule.
- One case (`written-let-in-record-field-aliased-called-in-two-instances.vl`) read a closure at
  the rep of an open field kid into a closed type: a rule-3 refusal. `irBLetTempTy` now names it
  `closure temp at an open type's rep`.

## Measured vs merge-base 04650021 (fixpoint seeds on both sides)

I8 census (`scripts/ir-i8-census/census.sh`), functions claimed and start bodies claimed:

| population | functions | start bodies |
| --- | --- | --- |
| self-compile | 19,167 → 19,168 | 138 → 138 |
| distilled | 43,311 → 43,319 | 6,924 → 7,083 |
| tests/cases | 57,363 → 57,514 | 3,756 → 3,786 |
| capability probes | 458 → 459 | unchanged |
| filed witnesses | 16,592 → 16,639 | 2,870 → 2,899 |

`claim fell back` rows are the same 11 as on the base. Over the 685 files, armed: mismatch
0 → 0, and covered 6,592 → 6,742 (all matched). The frontier the open type hid now leads: in
tests/cases, `call of a non-declaration` 633 → 658, `closure value inert` → 127, the coercions at
open types, and `rep ?` 266 → 333. Those stay IR-N6's.
