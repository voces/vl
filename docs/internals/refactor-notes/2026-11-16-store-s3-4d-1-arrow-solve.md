# S3.4d step 1: the arrow rule's solve, with no storage consumer, 2026-11-16

Lane STORE, S3.4d under the staging the coordinator ruled on 2026-11-16 (DECISIONS, via #8676):
1. the solve lands byte-identical, read by nothing;
2. one PR per class, in which `fnTagDecide` reads the solve and that class's `fnTagRedecide` branch
   is deleted;
3. the last such PR deletes `fnTagRedecide`.

This is step 1.

## What the solve produces

`BND_ARG` joins `ruleKinds`, so the per-row walk of S3.4a (`solveRules`) visits it in body order.
- Its arm, `arrowRule`, reads an argument row of form N, which is argument N of a call through a hole
  callee in the callee's body.
- It records that hole call's types at the outer call's bindings into `check_arrow.vl`: the callee's
  type and each argument's type, keyed by (outer call, hole call).
- When the hole callee is a parameter of the callee, the row keeps the outer call's argument node
  (`arrowFromAt`), because that node's own type names the set, which the bindings' closed signature
  loses.
- A quiet probe's solve is rolled back, so the rule records nothing under `inferQuiet`, as
  `fsbNoteCall` does.
- `SS_ARG` still judges every `BND_ARG` row (`validateArgCstrs`), so no diagnostic moves. ARG moves
  onto the rule in the first class PR that consumes the solve, with its moved-diagnostic list.

The table lives beside `InstReq`, not in an `Iface`: a hole call reads differently per caller
(design §4.3).

## The instrument

`$VL_IFACES` prints an `arrow` line. For each row it takes the sets the hole callee holds:
- its own set type; or
- for a parameter (of the caller, through the outer argument, or of the callee), the sets the
  set-binding rows bring to it.

For each set it computes each member's result at the row's closed argument types (`setMemberRetAt`),
then compares the result against the elaboration's mint facts in two ways:
- per (hole call, set), which is what `ftCommit` builds arms at;
- per (hole call, set, member results), which is what `ftBuildArmsAt` takes.

All 6,564 `@run` programs, fixpoint seed:

| key | both | solve only | mint only |
|---|---|---|---|
| (hole call, set) | 2,171 | 97 | 433 |
| (hole call, set, results) | 2,138 | 182 | 565 |

526 more rows have a set but open argument types: their callee forwards a hole into the call.

- The solve already gives 2,171 of the elaboration's 2,604 per-call facts (83%).
- Results agree on 2,138 of those.
- 421 programs are fully covered.

The class T witness (`closures/hole-fn-if-join-result-handed-hole-fn.vl`) reads 2/0/0: both of
its calls through `{add}`, with the members' results. Before this step, only the late pass's mint
rows knew them.

## Grading

- A/B, merged-tree fixpoint against master's fixpoint:
  - 6,564 `@run` programs: wasm and output byte-identical;
  - 1,789 other cases: `vl check` output byte-identical.
- Self-compile fuel 94,631,528,916, +0.10% on master's own fixpoint (94,532,615,848).
- Seed +6.3 KB.
- Late demands 3 (baseline 3).
- The comment-only fix-up refreshed to a byte-identical seed.
