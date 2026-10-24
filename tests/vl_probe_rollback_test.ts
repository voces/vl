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
//   leaks    — programs that each showed one site leaving rows behind now move nothing.
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

// An un-annotated return in a recursion group puts `f` through `inferReturnsPrePass`, whose
// quiet check of the body records the mismatch and then drops it.
const ERR_IN_INFERRED = `function f(x: i32) {
  const s: string = x
  if x > 0 { return g(x - 1) }
  return 1
}
function g(x: i32) { f(x) }
print(f(1))
`;

/** Check (or, with `build`, compile) `src` on a fresh instance; the rows the assertion counted. */
const rows = (src: string, arm: number, skip: number, build = false) => {
  const exp = new WebAssembly.Instance(compiled!, {})
    .exports as unknown as Exports;
  exp.probeRollbackArm(arm);
  exp.probeRollbackSkipSet(skip);
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  if (build) exp.compileSrc();
  else exp.checkSrc();
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

// Programs that each showed one site leaving rows behind before its set was widened; on the
// census every one of them now moves no table at any probe.
const LEAKED_BEFORE = [
  "generics/declared-record-arg-to-record-pattern.vl", // monoRecheck: let
  "generics/narrowed-nullable-at-pin.vl", // monoRecheck: mem
  "generics/error-hole-field-write-lands-at-pin.vl", // solveUnannotParams: holes, is
  "closures/captured-cell-alias-in-list-called-same-type.vl", // inferReturnsPrePass: print
  "numerics/literal-binding-infers-from-uses.vl", // inferReturnsPrePass: nln notes
  "inference/glean-vl005-inferred-union-return-hole-arm.vl", // globalInitPrePass: bin
];

// Programs whose probes each grew one keyed map beside the join rows before the maps joined the
// rollback (`check_map_undo`); the census counts a map by its key count.
const KEYED_LEAKED_BEFORE = [
  "generics/if-join-two-list-types-union.vl", // globalInitPrePass: tpIfJoinAt
  "generics/if-join-typaram-list-record-pin.vl", // globalInitPrePass: tpIfJoinAt
  "numerics/recursive-generic-joins-runtime-numbers-apart.vl", // cstrProbeBefore, inferReturnsPrePass: dJoinRelayed
  "generics/coalesce-join-at-list-pin.vl", // globalInitPrePass: tpIfOkAt
  "generics/fn-result-null-into-generic-nullable.vl", // cstrProbeBefore: tpIfOkAt
  "maps/for-in-union-of-maps.vl", // monoRecheck: tpIfOkAt
  "generics/enclosing-param-into-generic-nullable.vl", // solveUnannotParams: tpIfOkAt
];
const KEYED_MAPS = ["tpIfJoinAt", "tpIfOkAt", "dJoinRelayed"];

Deno.test({
  name: "probe rollback: no probe leaves a keyed join map grown",
  ignore,
  fn() {
    const bad: string[] = [];
    for (const f of KEYED_LEAKED_BEFORE) {
      const src = Deno.readTextFileSync(
        new URL(`./cases/${f}`, import.meta.url),
      );
      const moved = [...rows(src, 1, 0, true)].filter(([k]) =>
        KEYED_MAPS.some((m) => k.includes(`| ${m} |`))
      );
      if (moved.length > 0) bad.push(`${f}: ${show(new Map(moved))}`);
    }
    if (bad.length > 0) {
      throw new Error(`want no keyed map moved, got:\n  ${bad.join("\n  ")}`);
    }
  },
});

Deno.test({
  name: "probe rollback: the sites that leaked leave no table behind",
  ignore,
  fn() {
    const bad: string[] = [];
    for (const f of LEAKED_BEFORE) {
      const src = Deno.readTextFileSync(
        new URL(`./cases/${f}`, import.meta.url),
      );
      const moved = [...rows(src, 1, 0, true)].filter(([k]) =>
        !k.endsWith("| ran")
      );
      if (moved.length > 0) bad.push(`${f}: ${show(new Map(moved))}`);
    }
    if (bad.length > 0) {
      throw new Error(`want no table moved, got:\n  ${bad.join("\n  ")}`);
    }
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
