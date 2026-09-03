// Corpus-oracle shard 3 of 4. The adjudication lives in
// `tests/support/casesWasmOracle.ts`; this file exists only so that
// `deno test --parallel`, which gives one WORKER PER FILE, can spread the
// 2,786-case corpus over more than one core. Shard membership is
// a CONTIGUOUS equal-count block of the sorted case list, so every case is graded
// exactly once across the 4 files, in the order the unsharded file used.
//
// Adding or removing a shard means renumbering ALL of them and updating the
// ci-native "Corpus oracle" step — `tests/ci_seed_coverage_test.ts` fails until
// every shard is named there.
import { registerCorpusOracle } from "./support/casesWasmOracle.ts";

registerCorpusOracle(3, 4);
