## Infrastructure (Track F)

- **The IR shadow subtracts a chosen divergence (Q57):** `ir-shadow.vl` and `tests/vl_ir_shadow_test.ts`'s row files read `scripts/ir-divergence-baseline.txt`. A listed program's byte mismatches print `expected divergence` when a `$VL_IR_SHADOW=2` detail build names each one as a function listed for that program. An unlisted function and any non-bytes mismatch (verifier, spans, order) still red. `ir-shadow.vl --files` builds the programs it names, and a measure over no programs no longer checks the whole tree.
