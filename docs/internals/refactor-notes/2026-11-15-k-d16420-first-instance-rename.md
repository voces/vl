# D16420: the first instance re-spells a call through an alias, 2026-11-15

Lane K, bucket (f), clause 2.

## Mechanism

`const f = inc; print(f(3)); print(app(f, 4))`. `f(3)` mints `inc`'s first instance.

- The first instance reuses the template's slot and name (`monoMakeInstanceFirst`). It
  re-spelled only a call through a lambda binding (`monoLamCallByName`).
- A later instance (`monoMakeInstanceLater`) and a registry hit (`monoMakeInstanceHit`)
  re-spell any such callee.
- So `f(3)` kept the callee `f`, and the emitter found no function by that name.
- With `app(f, 4)` first, `f(3)` is a hit, which is the order dependence.

The elaboration's slot fact for `f` is right on master and on 2b (lane S measured it), so this
is mono's alone.

## Change (`emit_mono.vl`)

- **`monoCallInstByName`:** the later-instance rename (writer 6), lifted out.
- **`monoMakeInstanceFirst`:** asks it under the hit path's guards:
  - no captures, and not a reassigned read;
  - a lambda callee only at a lambda-call site.
- **`monoLamCallByName`:** folded in. It held a copy of the same rename for lambdas.

Net compiler lines: +2. Functions in `emit_mono.vl`: 908, unchanged. Pin helpers: none touched.

## Grading

On a fixpoint seed:
- **The witness:** prints `4`, `5`.
- **The row's ablation, and its own spellings, now run:** a list element, a `let`, a function
  body, an annotated `app`, `f64`, two types, a string identity, and `idg<T>` at one type and
  two.
- **Unchanged:** a reassigned `let` (`4 6 8`) and a capturing nested generic (`13 14`).
- **New `alias-of-hole-fn-called-then-delivered.matrix.vl`:** `runs 60 of 60 graded · 0
  silent`. 43 cells move from the emit reject to RUNS, and 0 are lost.
- **The other gates:** see the PR.
