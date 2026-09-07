// Corpus-oracle shard 0 of 4. The adjudication lives in
// `tests/support/casesWasmOracle.ts`; this file exists only so that
// `deno test --parallel`, which gives one WORKER PER FILE, can spread the
// corpus over more than one core (`scripts/wasm-runner-census.py --cells` counts it;
// a number here would go stale in silence, and this one had). Shard membership is
// a CONTIGUOUS equal-count block of the sorted case list, so every case is graded
// exactly once across the 4 files, in the order the unsharded file used.
//
// Adding or removing a shard means renumbering ALL of them and updating the
// ci-native "Corpus oracle" step — `tests/ci_seed_coverage_test.ts` fails until
// every shard is named there.
import { registerCorpusOracle } from "./support/casesWasmOracle.ts";

registerCorpusOracle(0, 4);
