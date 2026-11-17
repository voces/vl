# L2: mono's static read resolution, measured, and where it should move, 2026-11-16

The coordinator's ruling on [the D16881 note](2026-11-16-l2-d16881-arrow-reach.md): the read
resolution is L2's. Step 1 is to measure what `monoFlowReadSet` rewrites, by read shape; step 2
is to propose the move. STORE's S3.4d then builds D16881's refusal on it.

## The instrument

Branch `l2-mfr-measure` is measurement only and is never merged. It is built into a scratch seed
from master `bc6546163`. Under `$VL_REP_SHADOW=1`, the `mfr` shadow (`mfrShadowNote`) records
four things for each read mono asks about:
- its shape: the root, then each step (`.f`, `[k]` constant index, `[v]` variable index);
- the `mfrElabFns` rung that answers it;
- whether that answer is the same as the one taken at the end of check (`elabPrepare`'s last
  step), for each call's callee.

Mono asks only where its walkers find a candidate. **The answer is the elaboration's:**
`monoFlowReadSet` rewrites only when `mfrElabNames` agrees, so mono's walkers only gate which
reads are asked.

## The population

The corpus is 20,461 files (`tests/cases`, `distilled/cells`, `distilled/named`), plus
`compiler/entry.vl` and the 64 `set-closure-split-results` matrix cells.

- **1,849 asks in 694 files:** cases 1,177, `named/` 672, `cells/` 0, the compiler 0. The cells
  and the compiler hold no function value in a container.
- **Outcome:** agree 1,820, several 20, none 9.
- **Kind:** 1,780 are a call's callee, 69 a value read.

By rung:

| rung | asks | what answers |
| --- | --- | --- |
| `slotflow` | 1,323 | the elaboration's value-flow set for a `let`/`const` slot path (`elabSlotFlowFns`) |
| `indexed` | 358 | literal-index steps through the binding's or the argument's literal (`mfrIndexedFns`) |
| `constlist` | 155 | a module-scope `const` list's element (`constListFnElemDecl`) |
| `callees` | 7 | the elaboration's callee set for the call (`elabCalleeFnsOf`) |
| uncovered | 6 | a node minted after the check, outside its cover |

By root and steps:

| root | steps | asks |
| --- | --- | --- |
| `const` | none | 895 |
| `const` | constant index | 559 |
| `const` | fields only | 228 |
| `let` | none | 88 |
| `let` | fields only | 24 |
| un-annotated parameter | constant index | 13 |
| other | fields only | 12 |
| un-annotated parameter | fields only | 9 |
| `const` | variable index | 7 |
| `let` | constant index | 7 |
| loop variable | none / constant index | 6 / 1 |

D16878's same-order read (`o.l[0]`) is `param-hole.f[k]`, answered by `indexed`. It is one of the
13 rows in "un-annotated parameter, constant index".

## Is the answer available at check?

Rerunning the 694 files and the matrix cells with check's answer saved at the end of
`elabPrepare` and compared when mono asks:

| | asks |
| --- | --- |
| same at check as at mono | **1,790** |
| differs | 2 |
| not saved (a value read, or a node minted after check) | 76 |

- **The two that differ** are `named/d15221_ufcsb_{half,dbl}.vl`. Each indexes the result of a UFCS
  call (`const rs = 3.mk(); rs[1].f(3)`). The likely cause, not confirmed, is that mono resolves
  that call's callee differently by the time it asks.
- **The 76 unsaved asks** are 69 value reads, which the instrument saved only for calls, and 7
  uncovered nodes.

So the static read resolution is not mono's to move. **The elaboration already has it at check**
for every call mono asks about but two.

## D16881 on check's answer

Check's answer for the callee read, counted at the end of `elabPrepare`:

| program | holder | check's answer | today |
| --- | --- | --- | --- |
| D16878's same order (`o.l[0]`) | yes | one function | runs |
| D16881 without the holder (two orders) | no | many | runs |
| two orders, a runtime index | no | many | runs |
| D16881 (two orders, holder) | yes | many, inferred | emit refusal |
| same order, a runtime index, holder | yes | many, inferred | emit refusal |

- **The inferred rows are not observed.** A build the emitter refuses prints no shadow report,
  and check does not print the rep shadow. They are inferred because the `indexed` rung reads
  only the argument literals at `app`'s calls, which the holder line does not change. So D16881's
  answer is its holder-free twin's.
- **The rule this suggests:** refuse at check when the set's tag decision is forced (a generic
  holds the list) and check's answer for the callee read is not exactly one function. On these
  rows that rule matches today's outcome everywhere, and D16878's same-order spelling keeps
  running.

## Proposal (step 2)

**Move the query into the elaboration, not mono's walkers into check.**
- `mfrElabFns` and `mfrElabNames` leave `mfr_shadow.vl`, a shadow module, for an
  elaboration-owned query: "the functions read `x` holds, for call `call`".
- Check asks it after `elabPrepare`. Mono keeps asking it too, and its walkers stay as gates
  only.
- That is identical by construction: the same function, asked from a second place.

STORE's S3.4d refusal then reads the query beside the tag decision it already has.

**Before the refusal moves, two gaps close:**
1. **The two UFCS-initialiser asks.** Find why check's answer differs. If mono's rewrite of
   `3.mk()` is the cause, the elaboration should see the call as it does.
2. **Value reads** (69 asks) are outside the saved answers. The refusal reads only callees, so
   this gap is for completeness.

The 20 `several` asks are the sets themselves (the matrix's split cells). They are the refusal's
candidates, not a gap.

## SLOT's four node replacements

All are in the population. Every ask agrees, and the calls give the same answer at check.

| cell | asks |
| --- | --- |
| `generics/fn-value-generic-container-read-listed-or-stored` | `const.f` slotflow ×4, `const[k]` constlist ×9, `const` slotflow ×6, `let` slotflow ×4 |
| `closures/generic-list-literal-of-generic-read-out-of-list-to-generic` | `const[k]` constlist ×2, `const.f` slotflow ×1 |
| `closures/generic-list-sliced-called-at-two-types` | `const[k]` constlist ×8, `const[k]` indexed ×3, loop variable slotflow ×1 |
| matrix `set-closure-split-results` `return_inferred/ann` | `const[k]` constlist ×1 |
