# VL dogfooding notes

Running, friction-log of things that would improve VL (the language and the
self-hosted toolchain), collected while using `vl` to build and run real
programs. Each entry: what I hit, why it's friction, and a rough fix direction.
Newest first. This is a backlog, not a commitment — triage as you like.

## Self-host emitter coverage gaps (vs. the host TS emitter)

These programs type-check and run fine through the host TS compiler but the
self-hosted emitter (`compiler/wasmEmit.vl`, driven by the native `vl` tool)
cannot lower them yet. They're the concrete tail of "emitter coverage" (work
queue item 3). Surfaced by writing ordinary programs and running them through
`vl run`.

- **`for x in <structArray>`** — `for p in ps` where `ps: P[]` fails emit with
  `field access receiver is not a struct`. The host handles it (returns the
  right value); the self-host for-in lowering doesn't propagate the *element*
  struct type to the loop binding, so a subsequent `p.field` can't resolve the
  receiver. for-in over `i32[]` works (`loops/for-in.vl`), so the gap is
  specifically element-typed bindings. Fix direction: in the self-host emitter's
  for-in lowering, type the loop variable as the iterable's element type (it
  already knows the array's element type to emit `array.get`).

- **Broad emit gaps** (each rejects at the `emit` stage of `vl check`/`vl run`
  while type-checking clean): lambdas/closures, generics, sets, map `delete`,
  `.map`/`.filter` over arrays, function-typed values/equality, nested struct
  array push. ~59 Tier-1-accept corpus files are in this bucket (measured by the
  native-align probe). These are the substance of item 3.

## Toolchain / UX

- **Trap backtraces are anonymous.** A runtime trap prints
  `wasm backtrace: 0: 0xa2 - <unknown>!<wasm function 4>` — no function names,
  because the emitted module has no `name` custom section. Already on the roadmap
  (queue item 4: emit a name section behind a flag / print-presence so goldens
  stay byte-identical). Would make `@trap` debugging and any native stack trace
  legible.

- **`vl check` error presentation is clean by default** (no Rust backtrace unless
  `RUST_BACKTRACE` is set in the environment), prints `<stage> error` + the
  compiler's own diagnostics, exits nonzero. Good. (Noted here so the next person
  doesn't "fix" a non-problem: the backtraces you may see locally are from
  `RUST_BACKTRACE=1` in the shell, not the tool.)
