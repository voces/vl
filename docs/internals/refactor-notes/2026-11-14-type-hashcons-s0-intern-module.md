# Type hash-cons stage 0: the intern table becomes its own module (lane H), 2026-11-14

Stage 0 of `2026-11-14-type-hashcons-design.md` §3. This is a pure move. `hcIntern`'s table (the
columns, FNV-1a hash, growth and chained lookup) leaves `emit_rep.vl` for `compiler/intern.vl`,
which imports nothing:
- `internId(tag, args, len)` was `hcIntern`;
- `internLen(i)` was `hcLenOf`;
- `internTag(i)` and `internArg(i, k)` replace `hcBigInner`'s two direct column reads;
- `internReset()` is the column half of `hcReset`. The memo half stays in `emit_rep.vl`.

The `HC_*` tags, `hcDigits` and every rep-mode walk stay in `emit_rep.vl`. They are lane E's (rep
ADT design §6). This module is the one both arenas will instantiate.

Measured against master `781adf65`'s own fixpoint seed, built from `git archive` (6,820,027 bytes):

| reading | value |
|---|---|
| seed | fixpoint (two refreshes byte-identical), 6,820,178 bytes (+151) |
| L2 identity | the stage-0 seed builds master's `compiler/entry.vl` byte-identical to master's fixpoint |
| corpus identity | 596 distilled cells, every 20th file in sort order: 431 modules byte-identical, 165 refused cells with identical diagnostics, 0 differ |
| L2 guest fuel | 83,380,874,899 → 83,380,874,901 (+2) |
| L2 peak RSS | 4,269,416 KB → 4,269,376 KB |
| plumb fuel | main 9,231,899,264 and tail 6,688,466,530, which is +146 each against `58c5e37b`'s reading: the call layer |
| net compiler lines | +26: emit_rep.vl −95, intern.vl +121 (header and the three readers) |
| pin helpers (`emit_mono.vl`) | 908 → 908 |
| byte movers | none |

This stage deletes no code: as a move it pays for later stages. Stage 3 deletes `internLitTy`'s
string table into it, and lane E's stage 1 deletes `rtIntern`'s string key.
