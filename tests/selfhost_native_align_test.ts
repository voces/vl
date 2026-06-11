// NATIVE corpus alignment — the self-hosted `vl` binary, end to end, with zero
// TS/deno/V8 in the compile+run path (deno only DISCOVERS cases, parses their
// directives, and ASSERTS the verdict; the brains run in the native tool).
//
// Tiers 1 (verdict) and 2 (runtime) of the corpus already prove the VL pipeline
// AGREES with the spec when driven through the deno-hosted compiler module
// (`tests/selfhost_corpus_test.ts`, `tests/selfhost_corpus_run_test.ts`). THIS
// suite re-drives the same curated corpus slices through the NATIVE path —
// `scripts/vl-host` (Rust + wasmtime) executing `build/vl-compiler.wasm` — and
// asserts the native tool produces IDENTICAL behavior:
//
//   • RUN_CASES   `vl run <case>`  → stdout lines EQUAL the file's `@log` directives,
//                                    AND `vl check <case>` exits 0 (full compile clean).
//   • TRAP_CASES  `vl run <case>`  → exits NONZERO with a wasm runtime trap.
//   • REJECT_CASES `vl check`      → exits NONZERO, rejected at the parse/type STAGE
//                                    (an invalid program is caught by the front end and
//                                    NEVER reaches the emitter — the gate holds).
//
// SCOPE (matches the corpus directives the native binary can already adjudicate):
// `@run`/`@log` runtime parity, `@trap` trap-and-exit, and `@check`/`@error`
// accept-vs-reject WITH stage classification. OUT of scope (host-checker territory
// until span threading + message parity + a lint port land): `@error` message text,
// `@error-at` spans, and `@warning`/`@hint`/`@info` — this suite never pins those.
//
// PROVENANCE: the lists were seeded from the deno-pipeline whitelists (the `@run`
// runtime whitelist; the Tier-1 verdict whitelist's `@error` files) and now live
// in `tests/native-run-cases.txt` / `tests/native-reject-cases.txt`, the single
// source consumed by BOTH this suite and the native runner (`vl test --cases`) —
// grow them in one place and both harnesses follow. They are still independent of
// the deno-pipeline whitelists, so this suite does not regress when a parallel
// checker/parser PR grows those. The TRAP cases stay inline below: their corpus
// `@trap` directive pins a source-mapped message that only the host runner can
// adjudicate, so `vl test` refuses the directive and the deno suite keeps the
// weaker trap-and-exit contract explicit. NOTE: 59 Tier-1
// ACCEPT files type-check clean but the EMITTER cannot lower yet (lambdas, generics,
// sets, map `delete`, closures); `vl check` (a FULL compile) rejects them at the
// EMIT stage, so they are intentionally absent below — promoting them is the
// emitter-coverage work (queue item 3), not an alignment failure.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed
// wasm; absent either, every case registers as ignored with a one-line how-to-build
// note (so a plain `deno task test` stays fast and green; CI's native job opts in).

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
// Case paths (e.g. "cases/arith/ops.vl") resolve relative to this directory —
// the same base `vl test --cases` uses (relative to the list file's directory).
const TESTS = new URL("./", import.meta.url);

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const ENABLED = GATED && haveBin && haveSeed;
if (GATED && !ENABLED) {
  console.warn(
    `[native-align] skipped — ${!haveBin ? "missing vl binary" : "missing seed wasm"}. Build:\n` +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  deno run -A scripts/build-compiler-wasm.ts",
  );
}

const src = (rel: string) => Deno.readTextFileSync(new URL(rel, TESTS));
const logsOf = (s: string) =>
  [...s.matchAll(/^\s*\/\/\s*@log (.*)$/gm)].map((m) => m[1]);

type Run = { code: number; out: string; err: string };
const vl = async (args: string[]): Promise<Run> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    // Deterministic, compact stderr (no Rust backtrace) for stage matching.
    env: { RUST_BACKTRACE: "0" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};
const path = (rel: string) => new URL(rel, TESTS).pathname;
const stageOf = (err: string) => err.match(/(parse|type|emit) error/)?.[1] ?? "other";

// ── RUN_CASES: `vl run` stdout EQUALS @log, and `vl check` compiles clean ──
// Single-sourced from tests/native-run-cases.txt (shared with `vl test --cases`).
const casesList = (rel: string): string[] =>
  Deno.readTextFileSync(new URL(rel, TESTS))
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
const RUN_CASES = casesList("native-run-cases.txt");

// ── TRAP_CASES: `vl run` exits nonzero with a runtime trap ──
const TRAP_CASES = [
  "cases/traps/array-oob-read.vl",
  "cases/traps/divide-by-zero.vl",
];

// ── REJECT_CASES (@error): `vl check` rejects at the parse/type stage ──
// Single-sourced from tests/native-reject-cases.txt (shared with `vl test --cases`).
const REJECT_CASES = casesList("native-reject-cases.txt");

for (const rel of RUN_CASES) {
  Deno.test({
    name: `native-align run: ${rel} — vl run stdout == @log, vl check clean`,
    ignore: !ENABLED,
    fn: async () => {
      const want = logsOf(src(rel));
      const r = await vl(["run", path(rel)]);
      if (r.code !== 0) {
        throw new Error(`${rel}: vl run exited ${r.code}: ${r.err.trim().split("\n")[0]}`);
      }
      const got = r.out.length ? r.out.replace(/\n$/, "").split("\n") : [];
      if (JSON.stringify(got) !== JSON.stringify(want)) {
        throw new Error(
          `${rel}: log mismatch\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`,
        );
      }
      const c = await vl(["check", path(rel)]);
      if (c.code !== 0) {
        throw new Error(`${rel}: vl check should compile clean, exited ${c.code} (${stageOf(c.err)}): ${c.err.trim().split("\n")[0]}`);
      }
    },
  });
}

for (const rel of TRAP_CASES) {
  Deno.test({
    name: `native-align trap: ${rel} — vl run traps (nonzero exit)`,
    ignore: !ENABLED,
    fn: async () => {
      const r = await vl(["run", path(rel)]);
      if (r.code === 0) throw new Error(`${rel}: expected a runtime trap, vl run exited 0`);
      // A genuine RUNTIME trap, not a compile failure: stderr names a wasm trap and
      // no compile stage rejected it.
      if (!/wasm trap/.test(r.err)) {
        throw new Error(`${rel}: nonzero exit but no "wasm trap" in stderr: ${r.err.trim().split("\n").slice(0, 3).join(" / ")}`);
      }
    },
  });
}

for (const rel of REJECT_CASES) {
  Deno.test({
    name: `native-align reject: ${rel} — vl check rejects at parse/type`,
    ignore: !ENABLED,
    fn: async () => {
      const r = await vl(["check", path(rel)]);
      if (r.code === 0) {
        throw new Error(`${rel}: expected rejection, vl check exited 0`);
      }
      const stage = stageOf(r.err);
      // The front end must catch it — an invalid program must never slip past the
      // type-check gate into the emitter (which would mask an unsound accept).
      if (stage !== "parse" && stage !== "type") {
        throw new Error(
          `${rel}: rejected at "${stage}" stage, expected parse/type — the checker should catch this BEFORE emit\n  ${r.err.trim().split("\n").slice(0, 2).join(" / ")}`,
        );
      }
    },
  });
}
