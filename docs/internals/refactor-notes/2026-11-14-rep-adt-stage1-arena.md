# Rep ADT stage 1: the arena, 2026-11-14 (lane E)

This is stage 1 of [the Rep ADT design](2026-11-14-rep-adt-design.md) §3. It builds on
[stage 0's shadow](2026-11-14-rep-adt-stage0-shadow.md), and on lane H's `compiler/intern.vl`
once that lands. This note is in progress; this section came first, at the coordinator's request.

## Stage 0's disagreements, triaged

The question for each disagreement: which side is right, and is the flat `VKind` ever the wrong
one, which would make it a latent clause-1 bug? The method:
- run the cell and check its output against the program;
- read the emitted module with `./node_modules/.bin/wasm-dis` (a `--names` build) to see what
  the module actually uses;
- for the record cells, run the plainest neighbouring spellings.

The shadow now names the type and the function of an `uncovered` answer, which this triage needed.

| disagreement | cells | output | what the module uses | right side | follow-up |
|---|---|---|---|---|---|
| local `variant`, tree `struct` | 6 in `b000017`, `b000057`, `b000058`, `b000418` ×2, `b000498` | correct (0, 7, 7, 0, 0) | the variant struct of `Circle`, the type the literal `cc` is delivered to | **flat**, for storage. The tree is right about the *recorded* type, the literal's own `{r: …}`, but that is not the storage type. | stage 1: the record's arm status and storage type come from the checker or elaboration (lane S's slot store gives a literal holder its delivery class), not from emit-time adaptation |
| result `i32`, tree `closure` | 4: `d15199_run_function_field`, `d15220_run_coerced_holder` (`__lambda_0`, which returns a closure); `d511_coal_fn_{match,nomatch}_ret_none_direct` (`g`, which returns `a ?? b`) | correct | `(result (ref $closure))` in all four | **tree**. `fRetKind`'s `i32` is its documented "no non-i32 fact" default (`emit_state.vl:485`), not the valtype. | stage 2 deletes the default column |
| result `i32`, tree `closure`, self-build | 15 hook setters (`heldRepMintOn`, `rlLateRowsOn`, …) | — | `(result (ref $54))`, a closure, e.g. `heldRepMintOn` | **tree**, for the same reason | the same |
| result uncovered | 6 in `d947_price_{nulbool,nulcircle,nulstr}`: `std:test`'s `vltAbort` and `fail`, typed `never` | correct | no result at all | **neither**. The flat `i32` is the default, and the tree has no answer (`prim:never`). | stage 1: `void` and `never` results get a no-value answer. The design's §2.1 treated both as a checker gap, which is wrong for a function result. |

**Is any of them a clause-1 bug?** No.
- In every case where the two sides differ on a result, the module uses neither the flat `i32` nor
  a wrong rep. The valtype is written from the recorded type's rep, and `fRetKind` is a default
  column beside it.
- For the record locals, the flat kind is the one the module stores at, and the programs print the
  right values.
- Two neighbouring spellings ran correctly. Each hands the returned literal to `Circle`, to `Dot`
  (a structurally equal record that is not a union arm), to a `Shape` union parameter and to a
  `Dot[]` element. The variant ref flows into every one with the right values, at `i32 | null` and
  at `i64` fields.

So no inventory row is filed. The two stage-1 fixes, both on the tree side, are:
- record arm status from the checker;
- a no-value result for `void` and `never`.
