# Gate: a shipped build is never worse than the claimless one (2026-11-24, lane IR-P1)

The invariant G3 exists for, as a gate row (coordinator ruling, 2026-11-24): a program the
claimless compiler builds and runs clean is never invalid, refused, or run otherwise by the
shipped seed. Before this row, `ir claim refusals` compared only the programs legacy refuses, and
`ir-identity.sh --cases`/`--claimless` compared bytes in the queue's proof, not in `gate.sh`.

- **`ir-parity.vl --cross`.** It reds only where IR on is worse: `build-fails(on)`, or a
  `differs` whose IR-off module ran clean (rc 0, no trap). Those rows now lead with `off runs; `.
  A claimless failure, a refusal both sides raise with different text, and a behaviourally equal
  byte differ do not red in this mode. The default mode is unchanged.
- **`--pop pins`.** Every program under `tests/ir-shadow-rows`, the Q58 position pins.
- **`--sample N`.** A fixed 1-in-N of `cases`, by FNV-1a of the path, so a new file joins or not
  without moving the others.
- **Row `ir claim cross`.** `--pop cases,probes,pins --sample 12 --cross`, in both tiers.

The trigger was the G3 report N2 refuted on 2026-11-24 (D17160 is legacy's own invalid module,
claimed and claimless alike). The row is the standing check that such a report can be answered by.

## Cost (4-core box, warm caches)

| part | programs | CPU-s |
| --- | --- | --- |
| the claimless compiler the row builds | — | 41 |
| `--pop pins` | 431 | 23 |
| `--pop probes` | 282 | 13.5 |
| `--pop cases` whole | 7,762 | 469 |
| the row: `cases,probes,pins --sample 12` | 1,378 (665 cases) | 121 (103 user + 17.5 sys), 64 s wall |

A cold module cache costs more on the first population run: pins read 143 CPU-s cold, 23 warm.
The whole of `cases` was 0 red too, so the sample is a cost choice, not a known gap.

## Controls

| control | `--cross` | default |
| --- | --- | --- |
| `VL_FAULT_INJECT_CLAIMED=corrupt-validate-bytes` on `claimed-and-valid.vl` | rc 1, `build-fails(on)` | — |
| a `$VL` wrapper that adds a stdout line to the IR-on run (`--run-all`) | rc 1, `differs`, `off runs; stdout line 2: skew` | — |
| a `$VL` wrapper that fails the IR-off run | rc 0 | rc 1 |
| the row on master `0790f095` | rc 0, 0 red | — |
