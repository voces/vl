# Long list literals: one chunk writer and one data writer (2026-11-25, lane COV-START)

A list literal past the `array.new_fixed` operand cap (10,000 elements; 256 for a string or ref
list) has three legacy builds (`arrLitLongRouteOf`):
- `dataConst`: one data segment of constant elements; the IR already built it;
- `dataComputed`: the constants' segment, each computed element stored after it;
- `chunk`: chunks of up to the cap, each copied into the full backing.

The IR missed the last two (`array long dataComputed`, `array long chunk`). COV-CALL's long ref
list (`array ref`, D3462) needs the chunked build too. So each build is now a writer whose
elements are the caller's, which legacy's own arms and the IR's lowering share.

## The writers (`wasmEmit.vl`)

- **Chunks.** `arrLitChunkPlanOf(arm, slot)` names an arm's scratch kind, backing, wrapper and
  chunk size: i32, f32, f64, i64, a packed row, v128, string, or a ref-list slot.
  - `arrLitChunkOpen` opens the build, `arrLitChunkStep` flushes after each element, and
    `arrLitChunkClose` wraps the backing.
  - Legacy's string arm now builds through it. The three `arrLitStrChunk*` functions it replaces
    are deleted.
  - A ref list passes its slot. Building the ref arm is COV-CALL's.
- **A segment with computed elements.** `arrLitDataBuild` is split into the segment write
  (`arrLitDataSegWrite`) and the hold of the segment-built backing (`arrLitDataHold`).
  - `arrLitDataOpen` writes the segment and holds the backing. Each computed element is then
    stored: `arrLitDataStoreAt`, the element at the arm's width, `arrLitDataStoreEnd`.
    `arrLitDataClose` wraps the backing.
  - Legacy's own build calls the same pieces in the same order, so its bytes are unchanged.

## The IR

- The builder builds a `chunk` literal's elements as a short literal's: chunking is reachable for
  a packed row's computed element and for v128.
- A `dataComputed` literal's constants are immediates the lowering leaves unwritten (as
  `dataConst`'s are); each computed element is built as usual.
- The lowering writes the elements between the writer's calls.

Sweeps: `long-literal-chunked-arm-positions.vl` (i8, i16, u8, u16) and
`long-literal-data-computed-arm-positions.vl` (i32, f64, i64, f32). Each misses on master in the
start body and a function, and matches legacy byte for byte on the head.

## Measured, master 24d858b7 → head

Census probe (`$VL_IR_SHADOW=5`), same program lists on both sides; a tests/cases program a
batch dropped is rerun alone.

| reading | master | head |
|---|---:|---|
| `array long chunk` / `array long dataComputed` units, all populations | see PR | |
