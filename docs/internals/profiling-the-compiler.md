# Profiling the compiler

`VL_PROFILE_GUEST=<out.json>` runs a compile under a sampling guest profiler (~1 ms epoch
interrupts, `compile_vl_guest_profiled` in `scripts/vl-host/src/main.rs`) and writes a
Firefox-profiler JSON. Frames read `wasm-function[N]` unless the SEED carries a name section,
so build the seed with `--names` first — and profile with that seed, never ship it.

```sh
vl build compiler/entry.vl -o /tmp/names.wasm --names --compiler build/vl-compiler.wasm
VL_PROFILE_GUEST=/tmp/p.json vl build compiler/entry.vl -o /tmp/o.wasm --compiler /tmp/names.wasm
python3 scripts/profile-rank.py /tmp/p.json 20      # rank by SELF time
```

Notes, each of which cost something to learn:

* **The profiled run bypasses the `.cwasm` sidecar** (epoch instrumentation is a different
  engine config), so it pays ~10 s re-JITing the compiler no matter how small the input.
  That fixed cost is why the merge-gate guard is
  `tests/vl_module_predicate_scan_test.ts`'s ratio and not a profiler run.
* **Rank by SELF time, not inclusive.** A whole-arena scan called from one place shows up as
  ~all self; a dispatcher shows up as ~all inclusive. `profile-rank.py` prints both.
* **`__str_eq__` high in the list is a symptom, not a site** — it is the name-keyed
  registries (`isUName`, `variantIndexOf`, `declaredSlotOf`, `__map_probe__`) doing linear
  lookups. `python3 scripts/profile-rank.py` has a sibling idiom: rank the immediate PARENT
  frame of every sample whose leaf is a given function, to find whose loop it is.
* **`VL_STD=<worktree>/std`** on every worktree probe — the host resolves `std:` from the
  BINARY's checkout, which is the main repo's.
