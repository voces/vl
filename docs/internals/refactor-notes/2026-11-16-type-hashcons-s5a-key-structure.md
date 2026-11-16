# Type hash-cons stage 5a: mono's instance key stops parsing itself (lane H), 2026-11-16

This is the first slice of stage 5, instance keys as id vectors (design note §2.6, §3.2). Mono's
key is still a string. This slice removes the two places where mono reads its own key back as
text, and the linear registry scan.

## The parses

`monoMakeInstanceKey` spells each exact-type binding after the pins as `~tp=<canon>;`. It builds
these from `exSubN`/`exSubT` whenever the body tests a value of a type parameter. Two readers then
parsed that text back out of `k.key`:
- `monoKeyExactCanon(k, tp)` scanned the tail for `~tp=` and read up to the next `;`.
- `monoTypedTail(k, fd, pins)` re-walked the tail. It split each `~` segment at its `=`, dropped a
  binding the pins already name, and copied everything else verbatim, including the callback
  names (`@f,`) and the widened-return suffix (`=>…`).

`MonoInstKey` now carries the bindings as `exKeyN` (names) and `exKeyC` (canonical spellings), plus
`exEnd`, the key's offset just past them:
- `monoKeyExactCanon` is a lookup in those arrays.
- `monoTypedTail` rebuilds the filtered bindings from the arrays and appends
  `k.key.slice(k.exEnd)` unchanged.

The two differ in one case. The old scan would also have split a `~` inside the widened-return
render, for example a string literal type containing `~`. The identity runs below include no such
program.

## The registry

`monoMakeInstanceHit` found an instance by comparing `key` with every registered key, so total
lookup cost was quadratic in the instance count. `monoKeyRow`, private to `emit_mono.vl`, maps a
key to the first row registered under it, which is the row the scan returned. `monoKeyPush`
replaces both `monoKeys.push` sites, and the per-program reset clears the map with the list. A
first version kept the map in `emit_state.vl`, which raised the phase-state census's `cross` count
by one; inside `emit_mono.vl` it raises nothing.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base (master 350eab14e, after #8483) |
| identity | 2,000 of 2,000 files of a random sample, plus all 2,756 cases under `generics`, `closures`, `callbacks` and higher-order: byte-identical (the merge queue runs the full diff) |
| L2 output | `compiler/entry.vl` byte-identical under both seeds, from master's tree and from this branch's |
| guest fuel, fixed input (master's `compiler/entry.vl`) | 90,515,719,017 → 90,515,719,085 (+68 units). The registry scan was not hot in the self-compile |
| render-parse budget | ok, unchanged |
| phase-state census | ok, unchanged |
| net compiler lines | +12 (`emit_mono.vl`): the map and its two helpers, the three new key fields and `exEnd`'s sum, less the two scanning loops |
| pin helpers (`emit_mono.vl`) | 908 → 908 |

## What stage 5 still has

- **The pin segments are text.** `monoKeyPinSeg` spells each pin's kind and `tyCanonKey`. A
  `(TyId[], storage[])` key needs the storage field that lane STORE owns, so the set and literal
  discriminators stay as an opaque text field until STORE's ruling.
- **`monoAnonPinDiscrim` folds into the pin's set id (5b).** STORE agreed, on the condition that
  the shadow asserts no two arguments on one folded key differ in `fnTagTyIsTagged` on any function
  leaf.
- **`retWidenKey` is still `tyToStr`.** Moving it to the set id can merge or split instances, so it
  needs a shadow first.
