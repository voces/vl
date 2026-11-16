# 2026-11-16 — B6a-opt: a Set stops writing and growing its `vals` list

Lane AE4. Code: `compiler/wasmEmit.vl` (`mapShapeRow`, `mapShapeOfSet`,
`emitMapSetV`, `mapSetFnBody`, `emitMapSetStore`, `mapShapeIsSet`) and `compiler/emit_sections.vl`
(`mapCompactRowShape`, `mapShapeCompactable`, `MapCompactTys.isSet`,
`emitMapCompactFnCode`, `mapCompactSlide`).

## What changed

A `Set` is lowered as the i32-valued map of its key: the same struct, field 1 `vals` an `i32`
list of `true`s. Nothing reads a Set's values. The checker refuses `s[k]`, `get`/`set` on a
Set, Set↔map assignability, a union holding both a Set and an i32-cell map, and JSON over a
Set; `.values()` on a Set walks its keys.

Before this change a Set still kept `vals` in step on every `add`:
- a write on a re-add;
- on a fresh key, a push that grows the backing at the same capacity steps as the keys, with
  an `array.new_default` and an `array.copy` each time;
- the compaction's slide and length write.

Now a Set's store and compaction run on helper rows of their own. They are rows `n + 3` (string
key), `n + 4` (i32 key) and `n + 5` (i64 key), after the i64-keyed map's row `n + 2`, where `n`
is the mv slot count. On those rows a hit does nothing, a miss pushes only the key, and
compaction skips field 1. The `vals` list stays the empty list `Set()` built.

The struct layout is unchanged, so box tags, casts, field indices and the shared probe and
resize bytes all stay as they were. Each Set still allocates one empty `vals` wrapper at
construction, and its backing is the module's shared empty array. Maps take no new branch:
the Set test is made while emitting, as a parameter of `emitMapSetStore`, from the receiver's
unfolded shape at a set site and from the row's shape in a Set helper.

## Inventory (read-only survey before the change)

- Sites a Set reached: allocation at construction, the re-add overwrite, `emitMapPushVal`
  (grow with copy, append write, `len++`), `clear`'s `len = 0`, and the compaction's move and
  `len` write. Zero sites read a Set's values for their meaning.
- The index resize helpers (`__map_resize__`, `__map_resize_i32__`) never touch `vals`. The
  copy memory-gc-design §4.4 credited to "every resize" is the `vals` list's own grow on
  insert.
- Left alone: `clear`'s `len = 0` on the Set's own empty wrapper, which is harmless.

## Measurements

Benchmark (scratch): a `Set<i32>` of 3,000,000 adds and 3,000,000 `has`, then a string Set of
100,000 adds and 50,000 deletes. Built once per seed, run as a prebuilt module under
`VL_GC=tracing`, five runs each; peak RSS from `wait4`:

| | peak RSS (MiB) | user (s) |
| --- | --- | --- |
| master `979395d85` | 260.7–260.9 | 0.60–0.79 |
| this change | 235.7–235.9 | 0.59–0.72 |

An empty program peaks at about 8 MiB, so the heap peak falls about 10% (≈253 → ≈228 MiB).
That is short of the 17% memory-gc-design estimated, because the index and the keys dominate a
Set's memory. Time moves within noise. The host meters fuel only for the compiler, so the
program's own fuel is not available.

## Exactness

- Every corpus case that builds a `Set` (100 files) prints byte-identical output on master
  and on the candidate, at the default build.
- At `-O`, 97 of those build; all print identical output except one expected-trap case, whose
  trap offset moved because the module is smaller.
- New fixtures:
  - `tests/cases/sets/ops-against-a-model.vl`: random adds, deletes past compaction, and
    clears, string-, i32- and i64-keyed, checked against a membership list after every step;
    it calls `__map_set_3..5__` and `__map_compact_3..5__`.
  - `tests/cases/sets/beside-a-boolean-map-with-deletes.vl`: a Set and a `{[string]: boolean}`
    map in one module that deletes, each on its own rows.
