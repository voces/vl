# fn-fact-shadow: mono's closed type for a function-holding value, against the elaboration's

`run.sh` grades `elabHeldValTy` (`compiler/emit_elab.vl`) against the four `emit_mono` functions
that still derive the closed type of a value holding functions themselves
(architecture-target-2026-10.md §3.4, node type family):

| tag | mono function | the decision |
|---|---|---|
| `retobj` | `monoPinReturnedObj` | a record literal an un-annotated function returns |
| `objlit` | `monoClosedObjLitTy` | a record literal nested in one |
| `retlist` | `monoRetFnListTy` | a list literal of functions an un-annotated function returns |
| `retcall` | `monoCloseRetFnTy` | a stored call whose open result holds a function |

```sh
scripts/fn-fact-shadow/run.sh [--seed S] [--jobs N] [--out F] [FILE...]
```

`probe.patch` is applied to a copy of `compiler/`, uncommitted edits included, and never to the
tree. Each decision prints one line through `$VL_LATE_DEMANDS` (`elabShadowNote`), so the counts
are decisions, not programs, and the probe adds no host import. When the patch stops applying,
re-anchor it on the four functions above and on `elabLateCount` in `emit_elab.vl`.

## Classes

| class | the two sides |
|---|---|
| `agree` | the same type (`tySame`) |
| `differ` | both closed, different; the line names both |
| `old-only` | mono answers, the elaboration does not |
| `closed` | mono declines a value whose identity type is already closed, which the reader returns |
| `new-only` | the elaboration answers an open value, mono declines |
| `none` | neither answers |

Each line also names the reader's rule that answered (`rule=`: `identity`, `retslot` the return
slot fact, `calleeslot`, `calldst` the callers' one destination, `heldset`/`heldsetprog` the
function set's instances in the frame or the program, `leafid` the leaves' identity sets) and
`late=`, the elaboration keys the reader minted; the summary counts both.

`retlistR` is a `retlist` decision mono refused (-2), graded like the others. Mono's answer is read
at the point of its walk; the elaboration's is the same at any point, so a `differ` whose mono
side reads a binding mono pinned earlier in the walk is a walk-state difference, not a wrong fact.
