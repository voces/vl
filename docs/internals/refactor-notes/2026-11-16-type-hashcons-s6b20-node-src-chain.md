# Type hash-cons stage 6b: the two `nodeSrc` copy-chain limits become visited paths (lane HASH), 2026-11-16

Two walks in `emit_mono.vl` follow `nodeSrc`, an instance copy's link to the node it was copied
from, back toward the template node the checker's tables key:

- `monoArgSrcOf` stopped after 16 links and answered the node it had reached. That is a copy, not
  the template, so `recArgRepOf` keys nothing there.
- `monoArgClosedTyIn` stopped after 64 links while the node was still past the checker's covered
  arena.

Both now record the nodes they passed. A link back to one of them is a cycle and stops there,
with the answer the exhausted limit gave.

## Grading (fixpoint seeds, master `347772f0e` vs this branch)

- Identity sweep (`scripts/id-shadow/run.sh --identity`): all 2,827 corpus files build
  byte-identical. No corpus program has a copy chain at either limit. No witness was found, and
  the change closes no capability.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent.
