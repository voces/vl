// THE QUIET PROBES' ROLLBACK ASSERTION (`probeRollbackArm`, compiler/typecheck.vl; L4 in
// docs/internals/code-quality-2026-10.md).
//
// Armed, each quiet probe in the checker marks every rolled-back table's length on entry and
// counts, on leaving, each table whose length moved. `scripts/probe-rollback-census.ts` runs it
// over a corpus. This suite keeps that instrument from going blind:
//
//   fires    — `probeRollbackSkipSet(1)` makes `inferReturnsPrePass` keep its quiet
//              diagnostics, and the assertion must name exactly that table at that probe.
//   clean    — the same program with the rollback intact moves no table there.
//   disarmed — no rows at all.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores.
//
// Run with:  deno test -A tests/vl_probe_rollback_test.ts

import { COMPILER, exists } from "./support/tree.ts";

const ignore = !exists(COMPILER);
if (ignore) {
  console.warn(
    "[probe-rollback] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const compiled = ignore
  ? undefined
  : new WebAssembly.Module(Deno.readFileSync(COMPILER));

// An un-annotated return puts `f` through `inferReturnsPrePass`, whose quiet check of the body
// records the mismatch and then drops it.
const ERR_IN_INFERRED = `function f(x: i32) {
  const s: string = x
  return 1
}
print(f(1))
`;

/** Compile `src` on a fresh instance; the rows the assertion counted. */
const rows = (src: string, arm: number, skip: number) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.probeRollbackArm(arm);
  exp.probeRollbackSkipSet(skip);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  exp.checkSrc();
  const out = new Map<string, number>();
  for (let i = 0; i < exp.probeRollbackRowCount(); i++) {
    const b = new Uint8Array(exp.probeRollbackRowLen(i));
    for (let j = 0; j < b.length; j++) b[j] = exp.probeRollbackRowAt(i, j);
    out.set(new TextDecoder().decode(b), exp.probeRollbackRowN(i));
  }
  return out;
};

const show = (m: Map<string, number>) =>
  [...m].map(([k, n]) => `${k}=${n}`).sort().join("; ");

Deno.test({
  name: "probe rollback: a skipped rollback is named at its probe",
  ignore,
  fn() {
    const got = show(rows(ERR_IN_INFERRED, 1, 1));
    const want =
      "inferReturnsPrePass | T.diags | +=1; inferReturnsPrePass | ran=1";
    if (got !== want) throw new Error(`want: ${want}\n  got:  ${got}`);
  },
});

Deno.test({
  name: "probe rollback: with the rollback intact the probe moves nothing",
  ignore,
  fn() {
    const got = show(rows(ERR_IN_INFERRED, 1, 0));
    const want = "inferReturnsPrePass | ran=1";
    if (got !== want) throw new Error(`want: ${want}\n  got:  ${got}`);
  },
});

Deno.test({
  name: "probe rollback: disarmed, it records no row",
  ignore,
  fn() {
    const got = show(rows(ERR_IN_INFERRED, 0, 1));
    if (got !== "") throw new Error(`want no rows disarmed, got: ${got}`);
  },
});
