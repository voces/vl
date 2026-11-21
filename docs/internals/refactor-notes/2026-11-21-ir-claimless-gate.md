# The claim's identity with legacy, enforced at gate time (2026-11-21, lane IR-D1)

A function claimed as shipped (`$VL_IR_SHADOW=5`) is one the IR builds, verifies and lowers. Its
bytes are not compared with legacy's: the armed shadow compares them, but legacy runs first there.
A plan the claim asks before legacy, or a mint it skips, shows only in the shipped bytes. That is
how a block tail's statement claim shipped on 2026-11-21. This note records the audit, the cost of
enforcing the match per build, and the gate-time check the coordinator ruled for instead.

## The audit (fixpoint seed of master cb57cea3, all 26,216 programs of the I8 census)

- **Armed shadow.** 131,997 functions covered, 131,981 matched. 13 claimable functions in 6
  programs do not match, and none of them ships different bytes:
  - 7 fail their lowering (`unlowered: effect outside I1`, `operand above a valued if's value`),
    so the claim falls back. These are `claims-fallbacks.txt`'s rows.
  - 6 differ only in span rows (`spans: read index`).
  - Two start bodies mismatch in the shadow only (`start bytes: prefix or locals`, inventory
    D3190 and D3191). They are claimed as shipped, and their bytes equal legacy's.
- **Shipped against claimless.** Every program built under the shipped compiler and under the same
  tree with `CLAIMED` empty, comparing wasm and exit code: **26,216 same, 0 differ.**

## Per build: the armed shadow's cost

Enforcing the match per build would run legacy beside every claim, which is the armed shadow's
work. Guest fuel (`$VL_FUEL=1`), same fixpoint seed:

| build | shipped | armed | rise | wall |
|---|---:|---:|---:|---|
| L2 self-compile | 104,807,290,667 | 124,224,275,255 | +18.5% | 35.9 s → 43.0 s |
| `check-filed-witnesses.vl` | 1,214,055,794 | 1,379,888,967 | +13.7% | 0.42 → 0.52 s |
| `dead-exports.vl` | 625,012,997 | 698,849,474 | +11.8% | 0.23 → 0.30 s |

That is about 18 times the +1% per-PR fuel tier, and claiming would then save nothing. Refused.

## At gate time: `ir-identity.sh --claimless <seed> [list]`

`--claimless` builds the checkout's compiler with `CLAIMED` empty (as `--cases` does). It then
builds every distilled cell and every inventory witness filed `runs` (`ir-i8-census/witnesses.vl`)
under both, comparing wasm and exit code. A list file replaces that population. With `--cases`
covering `tests/cases` and the probes, every I8 population is covered. The merge queue runs it once
per batch that changes `compiler/`, and any differ is a veto (`merge-queue.md`, step 3).

Measured on the fixpoint seed of cb57cea3: **identical 14,011, fail under both 3,267, differ 0**,
in 647 s wall and about 1,620 CPU-s at `JOBS=4`.

**Failing control.** A throwaway seed whose IR framing writes one `nop` after a claimed function's
locals ships inert but different bytes. Over the first 50 distilled cells, `--claimless` under
that seed reads `identical 0, fail under both 23, differ 27` and exits 1. Under the clean seed
it reads `identical 27, fail under both 23, differ 0` and exits 0.
