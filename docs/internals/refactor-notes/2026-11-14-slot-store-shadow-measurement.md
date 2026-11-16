# Slot store: the class rule measured beside today's slot facts, 2026-11-14 (lane S)

This is the measurement the slot-store design note
([`2026-11-14-slot-store-design.md`](2026-11-14-slot-store-design.md)) asked for before any reader
switches: does one rule over places reproduce the facts the elaboration produces today?
- It is a scratch build only, never refreshed into `build/`, at master `7a1c6cdcb`.
- It changes no compiler code in this PR.

## The instrument

A scratch patch, 317 lines in `emit_elab.vl` and one call in `elabPrepare` after
`elabLitSlotCallees`. It reports through the late-demands channel (`$VL_LATE_DEMANDS=1`) so the
host needs no change.

**Places.** Steensgaard-style unification with paths, at program level only (no instance keys).
A place is a root with children per step (`e`, `v`, `f.<name>`, `r`):
- a binding's or parameter's declaration is a root;
- `x[i]`, `x.f` and `x?.f` are children of `x`'s place;
- `pop` / `get` / `at` / `find` / `shift` read the element child;
- `slice` / `filter` / `reverse` / `concat` are the receiver's place;
- a call of a declared function is that function's `r` child.

**Edges** come from the write index's consumer column (`cwIxUp` / `cwIxUpKind` / `cwIxUpAux`), read
once for every covered node:

| index role | edge |
|---|---|
| `LETINIT` | value ~ binding |
| `ASG_RHS` | value ~ the left side's place |
| `ELEM` / `FIELD` | value ~ the literal's `e` / `f.<name>` |
| `COAL` / `ARM` | value ~ the join |
| `RET` / `TAIL` | value ~ the function's `r` |
| `ITER` | `e` or `v` ~ the binder |
| `SPREAD` | `e` ~ the literal's `e` |
| `ARG` | `push` / `unshift` → the receiver's `e`; `set` → `v`; otherwise each callee (`elabCalleeFns`) parameter |
| `CALLEE` | the call is recorded on the class |

Unifying two places unifies their children with the same step, recursively. Each class keeps the
function declarations and lambdas that reach it, and the calls through it.

**The rule** (§3.3, rule 2 only): a function leaf's class closes at one signature when every call
through the class has closed argument types and the calls agree.

**What is compared.**
- For each un-annotated `let` that has a program-level fact (`elabSlotTys[holder|-1]`), each
  function leaf of the fact is compared with its class's signature.
- For each un-annotated `let` or parameter with an open type and no fact, each open function leaf
  is graded the same way.

## Readings

The population is the distilled corpus, `scripts/silent-sweep/distilled/{cells,named}`: 11,931
programs. 1,047 of them have at least one holder graded. The counts are function **leaves**, not
programs.

| holder | today | class rule | leaves |
|---|---|---|---|
| `let` | has a fact | the calls agree on the fact's signature | **327** |
| `let` | has a fact | the calls disagree with the fact | **0** |
| `let` | has a fact | no call through the class (the fact came from the values) | 39 |
| `let` | no fact | closes at one signature | **148** |
| `let` | no fact | calls at two signatures, at program level | 1,060 |
| `let` | no fact | calls at two signatures, inside an instanced function | 3 |
| `let` | no fact | a call's argument type is open, inside an instanced function | 72 |
| `let` | no fact | no call through the class | 63 |
| parameter | no fact | closes at one signature | 8 |

The whole run took 3 min 16 s wall at 3 jobs.

## What it says

1. **The rule reproduces every called fact.** 327 of 327 called leaves agree, and 0 disagree. The
   39 uncalled leaves are the values-decide half: they need rule 4 (the uncalled rule), which the
   instrument did not implement, not a different answer.
2. **148 leaves (and 8 parameters) close where the elaboration has no fact today.** Those programs
   are in the corpus, so mono's fallbacks (§1 of the design note: flow pins, call deliveries, the
   values' own results) are answering them now. These are the readers stage 2 can switch.
3. **The 1,063 two-signature leaves are rule 3's tagged-set case, not over-merging.** A sample of
   4, picked at random by file, was a genuine set or member called at two signatures in each case:
   - `d15270_list_one_member`: one member stored in a field list, `g(2)` and `g(2.5)`;
   - `d15116_gen_map_idx_f64_str_ab_fn`: a generic in a map, called at `f64` and `string`;
   - `d15116_listmap_idx_two_fn_2_2p5`;
   - `d15117_fw_nest_one_i32_str_ba_fn_bound`.

   They run today through the tag decision. In the class model, the class's storage is a set id,
   decided by stage 6 reading the class. 585 programs hold such a leaf.
4. **The 72 open-argument leaves are the per-instance case.** They sit inside instanced functions,
   where a program-level class sees the template's open types. Stage 2 keys places by instance
   (§3.1); the instrument did not.

## Not claimed

- **No instances.** The instrument is program-level only. Its parameter row is small (8) because
  most parameter holders sit in instanced functions.
- **Leaves are compared by parameter types only**, not by result.
- **No storage decision.** The rule is rule 2 alone: no set-id decision, no uncalled default, no
  annotated bound.
- **The sample is 4 programs.** "Not over-merging" is read from those 4, not from all 585.
