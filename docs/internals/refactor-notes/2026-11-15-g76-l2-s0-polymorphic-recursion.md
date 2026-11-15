# L2 S0, part 1: polymorphic recursion through an un-annotated function, measured, 2026-11-15

Lane G. This is the measurement L2's choice 3 is conditional on (`l2-inferred-interfaces-design.md`
§9): HM-monomorphic recursion inside a strongly connected component holds only if no program that
runs today depends on polymorphic recursion through an un-annotated function. Measured at master
`5e45620f`. Docs only.

## Population

- Every runnable program in `tests/cases` (a `// @run` case), plus the 12,140 distilled cells
  (`scripts/silent-sweep/distilled/{cells,named}`). The rest of the census is generated, not on disk.
- Prefilter, by source: parse each file's functions, link a function to every function whose name it
  calls, and take strongly connected components. Keep a file when a recursive component holds a
  function with an un-annotated parameter.
- That leaves **18 files**: 13 self-recursive and 5 mutually recursive. All 18 run today.

## Criterion

Build each file with `--names`. A template's instances are named `$f`, `$f$1`, …. A file depends on
polymorphic recursion when an instance of template `T` calls a different instance of a template in
`T`'s own component. HM would unify the two.

```
vl build <file> --compiler build/vl-compiler.wasm --names -o /tmp/x.wasm
./node_modules/.bin/wasm-dis /tmp/x.wasm -o /tmp/x.wat
grep -nE '^ *\(func \$|\(call \$' /tmp/x.wat     # each instance and the instances it calls
```

## Result

- **One file trips the criterion, and it is not polymorphic recursion:**
  `tests/cases/inference/hole-param-nullable-self-ref-field-arg.vl`, where `depth$1` calls `depth`.
  `depth(o)` (`o: L`) and `depth(o.next)` (`L | null`) make two instances because the arguments differ
  by nullability. Under HM with subtyping, the component's parameter is the join `L | null` and both
  calls are accepted by subsumption, as one instance.
- **The other 17 show none.** Five are named for "two types" (`generic-fn-value-hole-*-at-two-types`).
  There the two types belong to a hole *function* parameter called at two shapes, which L2's choice 4
  (one arrow bound per call shape) keeps.
- **So no corpus program depends on polymorphic recursion.**
- **The language does it today**, though. Unbounded polymorphic recursion is already refused, but
  bounded polymorphic recursion runs:
  `function f(x, n: i32) { if n <= 0 { return 0 }; return f("s", n - 1) + 1 }; print(f(1, 3))`
  prints `3` from two instances. That program is filed as D16428 with status `runs today and must
  keep running` until the owner rules on choice 3. The coordinator is taking the choice to the owner,
  with the recommendation of HM.

## Limits

- The prefilter matches names, not resolved calls. A recursion through a function value or a method
  is missed, so the population is a floor.
- The census beyond the distilled cells was not built. S0 proper's shadow-scheme printer
  (`vl check --ifaces`) replaces this prefilter with the checker's own call graph.
