// NATIVE corpus alignment — the self-hosted `vl` binary, end to end, with zero
// TS/deno/V8 in the compile+run path (deno only DISCOVERS cases, parses their
// directives, and ASSERTS the verdict; the brains run in the native tool).
//
// The corpus oracle (`tests/cases_wasm_*_test.ts`) proves the VL pipeline AGREES
// with the spec when the seed is driven as a wasm module under deno. THIS suite
// re-drives the SAME corpus through the NATIVE path — `scripts/vl-host` (Rust +
// wasmtime) executing `build/vl-compiler.wasm` — and asserts the native tool
// produces IDENTICAL behavior:
//
//   • RUN         `vl run <case>`         → stdout lines EQUAL the file's `@log`
//                                           directives, AND `vl check <case>`
//                                           exits 0 (the front end accepts it).
//   • TRAP        `vl run <case>`         → exits NONZERO with a wasm runtime trap.
//   • REJECT      `vl check <case>`       → exits NONZERO, rejected at the parse/type
//                                           STAGE (an invalid program is caught by the
//                                           front end and NEVER reaches the emitter).
//   • ACCEPT      `vl check <case>`       → exits 0 — the corpus's "must-not-error"
//                                           half, the check-tier cases with no `@run`.
//   • EMIT-REJECT `vl check --codegen`    → exits NONZERO at the EMIT stage with the
//                                           `@emit-error` message text.
//
// COVERAGE IS BY DISCOVERY, NOT BY WHITELIST. Every `.vl` under `tests/cases/` is
// classified by its OWN directives and lands in exactly one tier; a file with no
// directives at all (a module part, a shared lint helper) is not a case. Skipping
// a case takes an `EXCLUSIONS` entry with a written reason, and a tripwire FAILS
// once an excluded case starts agreeing — so a fix gets promoted instead of
// forgotten. The polarity is the point: under an opt-IN whitelist a whole new
// directory of cases is covered by NOTHING and the tell is silence; under opt-OUT
// the default is coverage and every hole is a line of prose someone had to write.
//
// SCOPE (matches the corpus directives the native binary can already adjudicate):
// `@run`/`@log` runtime parity, `@trap` trap-and-exit, and `@check`/`@error`
// accept-vs-reject WITH stage classification. OUT of scope (host-checker territory
// until span threading + message parity + a lint port land): `@error` message text,
// `@error-at` spans, and `@warning`/`@hint`/`@info` — this suite never pins those,
// so a warning-only case is adjudicated for its ACCEPT verdict alone.
//
// NOTHING HERE SPAWNS ONE PROCESS PER CASE. `vl run --batch` runs the RUN/TRAP tiers
// in waves and `vl check --batch --json` checks every tier's `vl check` leg in waves —
// both because the per-invocation floor (process + two wasmtime engine builds + the
// multi-MB seed) dominates the compiling, 77% of it for the check leg
// (`docs/internals/test-timing-2026-09.md` §5a). The per-case TESTS are untouched: each
// still awaits its own memoized result and asserts on it alone.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed
// wasm; absent either, every case registers as ignored with a one-line how-to-build
// note (so a plain `deno task test` stays fast and green; CI's native job opts in).
//
// @test-timing native
// @test-timing sweep n=2328 name~"native-align setup"

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const CASES = new URL("./cases/", import.meta.url);

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const ENABLED = GATED && haveBin && haveSeed;
if (GATED && !ENABLED) {
  console.warn(
    `[native-align] skipped — ${!haveBin ? "missing vl binary" : "missing seed wasm"}. Build:\n` +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/fetch-seed.sh",
  );
}

const src = (rel: string) => Deno.readTextFileSync(new URL(rel, CASES));
const path = (rel: string) => new URL(rel, CASES).pathname;
const base = (rel: string) => rel.split("/").pop()!;
const head = (s: string, n = 1) => s.trim().split("\n").slice(0, n).join(" / ");

// ── Bounded-concurrency gate for subprocess spawns ────────────────────────────
// Deno runs the tests in ONE file sequentially, so an awaited spawn per case is a
// strictly SERIAL chain: 1,618 `vl check` processes, each paying process +
// wasmtime engine + seed `.cwasm` deserialize before it compiles anything. That
// CHAIN, not the compiling, was this suite's cost (measured 2026-07-29: ~6 ms per
// spawn, the file alone 12 s locally and ~27 s on the 4-core CI runner — the
// single largest step in `ci-native`).
//
// The spawns are independent of one another, so they are queued through this gate
// and each test awaits its OWN memoized result. The command, its arguments, its
// environment and the assertion applied to its output are all UNCHANGED; only the
// SCHEDULE moves.
//
// The limit is the core count clamped to [2, 8]: `deno test --parallel` already
// fans the test FILES across workers, so an unbounded pool here would multiply
// against that and thrash a small runner.
const gate = (limit: number) => {
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = (): Promise<void> => {
    if (active < limit) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>((res) => waiting.push(res));
  };
  const release = () => {
    // Hand the SLOT to the next waiter rather than releasing and re-acquiring, so
    // the limit cannot be transiently exceeded by an interleaved caller.
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  };
};
const SPAWN_JOBS = Math.max(2, Math.min(8, navigator.hardwareConcurrency || 4));
const spawnGate = gate(SPAWN_JOBS);

type Run = { code: number; out: string; err: string };
const vl = (args: string[]): Promise<Run> =>
  spawnGate(async () => {
    const { code, stdout, stderr } = await new Deno.Command(VL, {
      args: [...args, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
      // Deterministic, compact stderr (no Rust backtrace) for stage matching.
      // VL_STD pins the std dir to THIS tree: agent worktrees symlink the cargo
      // target into the main checkout, so the binary's exe-relative std/
      // fallback (/proc/self/exe resolves symlinks) would point at the WRONG
      // checkout there. The env override is the first hit in the host's std-dir
      // resolution either way.
      env: { RUST_BACKTRACE: "0", VL_STD: `${ROOT}/std` },
    }).output();
    return {
      code,
      out: new TextDecoder().decode(stdout),
      err: new TextDecoder().decode(stderr),
    };
  });
/** One `vl check --json` diagnostic. `stage` names the phase that produced it. */
type Diag = {
  file: string;
  severity: string;
  stage: string;
  code?: string;
  line?: number;
  col?: number;
  endCol?: number;
  message: string;
};

/** What one case's `vl check` leg hands its tier assertion. */
type Verdict = { code: number; stage: string; text: string };

/**
 * The stage a refusal is classified at, from the diagnostics rather than from a
 * regex over the summary line. It is the driver's return-code ladder read backwards:
 * `import` and `parse` are rc 1, `type` rc 2, `emit` rc 3, and rc is the FIRST
 * non-empty stream — so the earliest stage present is the one the summary's
 * `(… error)` note would have named. No error diagnostics is "other", exactly as an
 * absent note was, and that is what an `invalid-module` (stage `validate`, rc 0 at the
 * emitter) still grades as.
 *
 * Reading the key rather than the sentence also drops a false positive the regex had:
 * it matched "parse error" wherever it appeared, INCLUDING inside a diagnostic's own
 * message and inside the source line a caret block echoes. Seven corpus cases hit that
 * — all of them `vl check` clean, so the value fed a failure message that was never
 * built (see the PR's verdict table).
 */
const stageOf = (diags: Diag[]): string => {
  const errs = diags.filter((d) => d.severity === "error");
  if (errs.some((d) => d.stage === "import" || d.stage === "parse")) return "parse";
  if (errs.some((d) => d.stage === "type")) return "type";
  if (errs.some((d) => d.stage === "emit")) return "emit";
  return "other";
};

// ── Directive scan + tier classification ──────────────────────────────────────
// A directive is a line whose comment body starts with `@name`. This is
// deliberately the SAME shape the corpus oracle's parser accepts, so the two
// runners cannot disagree about which tier a case belongs to.
const directive = (s: string, name: string) =>
  new RegExp(String.raw`^\s*//\s*@${name}\b`, "m").test(s);
const logsOf = (s: string) =>
  [...s.matchAll(/^\s*\/\/\s*@log (.*)$/gm)].map((m) => m[1]);
const emitErrorsOf = (s: string) =>
  [...s.matchAll(/^\s*\/\/\s*@emit-error (.*)$/gm)].map((m) => m[1]);
const foldMsg = (s: string) => s.toLowerCase().replace(/`/g, "'");
/** The first `@name` on any directive-shaped line, whatever the name. */
const anyDirective = (s: string) => /^\s*\/\/\s*@(\S+)/m.exec(s)?.[1];

const walkVl = function* (dir: URL): Generator<string> {
  for (const entry of Deno.readDirSync(dir)) {
    const child = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) yield* walkVl(child);
    else if (entry.name.endsWith(".vl")) {
      yield child.pathname.slice(CASES.pathname.length);
    }
  }
};

type Tier = "run" | "trap" | "reject" | "accept" | "emit-reject";

/**
 * Every tier a file's directives claim. A well-formed case claims exactly one:
 * a `@log` line IS a runtime expectation (so it selects the RUN tier whether or
 * not the file also spells `@run`), and the reject/trap/emit tiers are mutually
 * exclusive with it by construction. ACCEPT is the residue — a case that
 * declares only check-tier expectations is asserting it compiles clean.
 */
const tiersOf = (s: string): Tier[] => {
  const t: Tier[] = [];
  if (directive(s, "emit-error")) t.push("emit-reject");
  // `@error\b` covers `@error-at` too — both are reject-verdict directives.
  if (directive(s, "error")) t.push("reject");
  if (directive(s, "trap")) t.push("trap");
  // `@no-instantiate` (the `xfail-miscompile-` kind) is an ACCEPT case here, and that is the
  // point of the directive rather than a convenience: the program is well-typed and `vl check`
  // exits 0 on it. The failure is that the module it writes does not instantiate. So what native
  // alignment has to assert is exactly that the native tool ACCEPTS it too; asserting a run tier
  // would demand the module load, which is the very thing the case pins as broken.
  //
  // The accept tier checks WITHOUT `--codegen` (see `checkCleanDivergence`), which is what keeps
  // this tier correct now that `--codegen` validates its own output and reports these as
  // `invalid-module`. That second gate is asserted over the same files, as a set-equality
  // tripwire, in tests/vl_check_codegen_test.ts — deliberately there and not here, so this
  // suite keeps asserting front-end alignment and nothing else.
  //
  // Pushed BEFORE the run tier and with no `t.length` guard, so a file carrying BOTH
  // `@no-instantiate` and `@run`/`@log` claims two tiers and lands in AMBIGUOUS. That
  // combination is a corpus bug — the file says the module does not load and then asserts its
  // output — and this suite's own contract is that a well-formed case claims exactly one tier,
  // so it should be reported as the contradiction it is rather than mis-asserted as a run.
  if (directive(s, "no-instantiate")) t.push("accept");
  if (directive(s, "run") || logsOf(s).length > 0) t.push("run");
  if (t.length === 0) {
    for (const d of ["check", "warning", "hint", "info"]) {
      if (directive(s, d)) {
        t.push("accept");
        break;
      }
    }
  }
  return t;
};

// ── EXCLUSIONS: the only cases discovery finds but this suite does not assert ──
// One entry per skipped case, each with the reason it cannot hold. A tripwire
// below re-runs every entry and FAILS when one starts agreeing — an exclusion
// that has been fixed must be deleted, not left to rot.
const EXCLUSIONS: Record<string, string> = {
  "lint/generic-intersection-no-warn.vl":
    "checker gap — a generic intersection `T & S` inside a union reports `unknown type 'T'`, so this must-not-error fixture cannot check clean yet",
};

const TIERS: Record<Tier, string[]> = {
  run: [],
  trap: [],
  reject: [],
  accept: [],
  "emit-reject": [],
};
/** Excluded cases, paired with the tier they WOULD be asserted in. */
const EXCLUDED: { rel: string; tier: Tier }[] = [];
/** Files whose directives claim more than one tier — a corpus bug, never valid. */
const AMBIGUOUS: { rel: string; tiers: Tier[] }[] = [];
/** Files claiming no tier: module parts and shared helpers, which carry no directives. */
const UNCLASSIFIED: string[] = [];

for (const rel of [...walkVl(CASES)].sort()) {
  const tiers = tiersOf(src(rel));
  if (tiers.length > 1) AMBIGUOUS.push({ rel, tiers });
  else if (tiers.length === 0) UNCLASSIFIED.push(rel);
  else if (rel in EXCLUSIONS) EXCLUDED.push({ rel, tier: tiers[0] });
  else TIERS[tiers[0]].push(rel);
}

// ── Batched `vl run` (RUN + TRAP tiers) ───────────────────────────────────────
// One `vl run --batch` process runs MANY cases: the per-spawn fixed costs
// (process + two wasmtime engine builds + loading the multi-MB compiler module)
// are paid once per batch instead of once per case; each case still gets a fresh
// isolated Store (same protocol scripts/fuzz-vl.sh drives). Per input file the
// host writes `<basename>.out` (print output, always) and `<basename>.err` (the
// SAME rendered error a failing `vl run` prints — compiler diagnostics / trap
// text — only on failure), so the per-case assertions below are unchanged in
// strength: stdout still must equal `@log` exactly, and a trap still must render
// "wasm trap". The `vl check` legs batch too, further down.
//
// Outputs are keyed by BASENAME, and the corpus reuses basenames across dirs
// (dozens of `entry.vl`, several `basics.vl`, …) — and module imports resolve
// relative to the REAL entry path, so inputs cannot be renamed/symlinked flat.
// Instead the cases are partitioned into WAVES that hold each basename at most
// once. The most-repeated basename forces the wave COUNT; within that count the
// cases are spread EVENLY, so the waves run as N similar-sized parallel batches
// rather than one batch carrying nearly everything.
//
// The batch is LAZY (first test to need it kicks it off, everyone awaits the
// same promise) so filtering/ignoring never pays for it, and per-case test
// granularity + names are untouched.
const partitionWaves = (rels: string[]): string[][] => {
  const mult = new Map<string, number>();
  for (const rel of rels) mult.set(base(rel), (mult.get(base(rel)) ?? 0) + 1);
  const n = Math.max(1, ...mult.values());
  const waves: string[][] = Array.from({ length: n }, () => []);
  const taken: Set<string>[] = Array.from({ length: n }, () => new Set());
  for (const rel of rels) {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (taken[i].has(base(rel))) continue;
      if (best < 0 || waves[i].length < waves[best].length) best = i;
    }
    // n is the maximum multiplicity, so some wave is always free for this name.
    waves[best].push(rel);
    taken[best].add(base(rel));
  }
  return waves.filter((w) => w.length > 0);
};

type BatchResult = { out: string; err: string | null };
let batchP: Promise<Map<string, BatchResult>> | null = null;
const batchResults = (): Promise<Map<string, BatchResult>> =>
  batchP ??= (async () => {
    const results = new Map<string, BatchResult>();
    await Promise.all(
      partitionWaves([...TIERS.run, ...TIERS.trap]).map(async (wave) => {
        const dir = await Deno.makeTempDir({ prefix: "vl-native-align-batch-" });
        try {
          const { code, stderr } = await new Deno.Command(VL, {
            args: [
              "run",
              "--batch",
              "--out-dir",
              dir,
              ...wave.map(path),
              "--compiler",
              COMPILER,
            ],
            stdout: "piped",
            stderr: "piped",
            env: { RUST_BACKTRACE: "0", VL_STD: `${ROOT}/std` },
          }).output();
          // Nonzero exit = the BATCH itself could not run (per-case failure is a
          // `.err` file, never a batch abort) — surface it in every awaiting test.
          if (code !== 0) {
            throw new Error(
              `vl run --batch exited ${code}: ${new TextDecoder().decode(stderr).trim()}`,
            );
          }
          for (const rel of wave) {
            const out = await Deno.readTextFile(`${dir}/${base(rel)}.out`);
            let err: string | null = null;
            try {
              err = await Deno.readTextFile(`${dir}/${base(rel)}.err`);
            } catch {
              // no `.err` file — the case ran clean.
            }
            results.set(rel, { out, err });
          }
        } finally {
          await Deno.remove(dir, { recursive: true }).catch(() => {});
        }
      }),
    );
    return results;
  })();

/** A single `vl run`, shaped like a batch result (used off the batch path). */
const runOne = async (rel: string): Promise<BatchResult> => {
  const r = await vl(["run", path(rel)]);
  return { out: r.out, err: r.code === 0 ? null : r.err || r.out };
};

// ── The `vl check` legs, BATCHED ──────────────────────────────────────────────
// Every tier ends in a `vl check` (or `vl check --codegen`) of one case, and each is
// independent of every other. They used to be one spawn each — ~2,989 processes, of
// which 77% was the process + engine + seed floor and only 23% the compiling
// (`docs/internals/test-timing-2026-09.md` §5a). `vl check --batch --json` takes a file
// LIST and writes one `{file, exit, diagnostics}` record per input, so the floor is
// paid once per WAVE instead of once per case.
//
// WHAT KEEPS THE VERDICT THE SAME. `--batch` grades each NAMED file exactly as
// `vl check <file>` alone grades it — same whole-graph lint scope, same report, same
// exit — and `tests/vl_check_json_test.ts` pins that by comparing a record against that
// file's own lone run rather than spot-checking a field. On top of that, both inputs
// the tier assertions read come from the record rather than from stderr: the exit code
// is the record's own `exit` (never the batch process's), and the stage is `stageOf`
// above.
//
// THE FILE LIST IS THE TIERED CASES, which is why this is a list and not
// `vl check <dir> --json`. A directory walk checks every `.vl` under it, including the
// module PARTS and shared helpers `tiersOf` deliberately excludes — the second blocker
// §5a names. Naming the files removes it rather than working around it, and it is also
// what lets the `--codegen` leg cover the EMIT-REJECT tier alone instead of emitting
// the whole corpus.
//
// A case a wave does not name is one the batch cannot answer for, so `checkRun` THROWS
// rather than falling back to a spawn: a silent fallback would be a second code path
// with its own verdict, which is the thing this rewrite has to not have.
const CHECK_LEG = (tier: Tier): "check" | "codegen" =>
  tier === "emit-reject" ? "codegen" : "check";
const CHECK_LEGS: Record<"check" | "codegen", string[]> = { check: [], codegen: [] };
for (const tier of ["run", "accept", "reject", "emit-reject"] as Tier[]) {
  CHECK_LEGS[CHECK_LEG(tier)].push(...TIERS[tier]);
}
// The exclusion tripwires re-run the same assertion over their case, so the batch has
// to carry them too. A TRAP-tier exclusion has no `vl check` leg at all.
for (const { rel, tier } of EXCLUDED) {
  if (tier !== "trap") CHECK_LEGS[CHECK_LEG(tier)].push(rel);
}

/** Round-robin into at most `SPAWN_JOBS` waves, so long and short cases mix evenly. */
const checkWaves = (rels: string[]): string[][] => {
  if (rels.length === 0) return [];
  const n = Math.min(SPAWN_JOBS, rels.length);
  const out: string[][] = Array.from({ length: n }, () => []);
  rels.forEach((rel, i) => out[i % n].push(rel));
  return out;
};

/** One `vl check --batch --json` process over `rels`, in argv order. */
const checkWave = (
  rels: string[],
  codegen: boolean,
): Promise<[string, Verdict][]> =>
  spawnGate(async () => {
    const { code, stdout, stderr } = await new Deno.Command(VL, {
      args: [
        "check",
        "--batch",
        "--json",
        ...(codegen ? ["--codegen"] : []),
        ...rels.map(path),
        "--compiler",
        COMPILER,
      ],
      stdout: "piped",
      stderr: "piped",
      env: { RUST_BACKTRACE: "0", VL_STD: `${ROOT}/std` },
    }).output();
    const lines = new TextDecoder().decode(stdout).split("\n").filter((l) =>
      l.trim() !== ""
    );
    // One record per input, or the process died part-way through the wave — a compiler
    // TRAP is the way that happens, and the host's stderr banner names the file it was
    // compiling. Loud here rather than a missing key later.
    if (lines.length !== rels.length) {
      throw new Error(
        `vl check --batch wrote ${lines.length} records for ${rels.length} files ` +
          `(exit ${code}): ${new TextDecoder().decode(stderr).trim().slice(0, 600)}`,
      );
    }
    return lines.map((line, i) => {
      const rec = JSON.parse(line) as {
        file: string;
        exit: number;
        diagnostics: Diag[];
      };
      // Records are in argv order, so a mismatch here means the batch and this suite
      // disagree about WHICH file a verdict belongs to — the one way batching could
      // grade a case against another case's result.
      if (rec.file !== path(rels[i])) {
        throw new Error(
          `vl check --batch record ${i} names ${rec.file}, expected ${path(rels[i])}`,
        );
      }
      return [rels[i], {
        code: rec.exit,
        stage: stageOf(rec.diagnostics),
        text: rec.diagnostics.map((d) => d.message).join("\n"),
      }] as [string, Verdict];
    });
  });

// LAZY, like the `vl run --batch` fixture above: a filtered run that never reaches a
// check leg never pays for it.
const checkP: Record<"check" | "codegen", Promise<Map<string, Verdict>> | null> = {
  check: null,
  codegen: null,
};
const checkResults = (
  leg: "check" | "codegen",
): Promise<Map<string, Verdict>> =>
  checkP[leg] ??= (async () => {
    const parts = await Promise.all(
      checkWaves(CHECK_LEGS[leg]).map((w) => checkWave(w, leg === "codegen")),
    );
    return new Map(parts.flat());
  })();

const checkRun = async (rel: string, codegen: boolean): Promise<Verdict> => {
  const leg = codegen ? "codegen" : "check";
  const v = (await checkResults(leg)).get(rel);
  if (!v) {
    throw new Error(
      `${rel}: no --batch record on the ${leg} leg — its tier did not queue it`,
    );
  }
  return v;
};
let warmed = false;
const warmChecks = (): void => {
  if (warmed) return;
  warmed = true;
  // Not awaited: `spawnGate` bounds the in-flight count and each test awaits — and
  // reports — its own case. Marked handled so a wave that cannot start surfaces
  // against the owning test rather than as an unhandled rejection.
  checkResults("check").catch(() => {});
  checkResults("codegen").catch(() => {});
};

// ── Per-tier assertions, as functions: `null` = the native tool agrees ─────────
// The per-case tests and the exclusion tripwires call the SAME function, so a
// tripwire can never drift from the assertion it is guarding.
const runDivergence = (rel: string, r: BatchResult): string | null => {
  if (r.err !== null) return `vl run failed: ${head(r.err)}`;
  const want = logsOf(src(rel));
  const got = r.out.length ? r.out.replace(/\n$/, "").split("\n") : [];
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    return `log mismatch\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`;
  }
  return null;
};

const trapDivergence = (r: BatchResult): string | null => {
  if (r.err === null) return "expected a runtime trap, vl run succeeded";
  // A genuine RUNTIME trap, not a compile failure: the rendered error names a
  // wasm trap and no compile stage rejected it (a compile rejection renders
  // "parse/type/emit error", never "wasm trap").
  if (!/wasm trap/.test(r.err)) {
    return `failed but no "wasm trap" in the error: ${head(r.err, 3)}`;
  }
  return null;
};

const checkCleanDivergence = async (rel: string): Promise<string | null> => {
  const c = await checkRun(rel, false);
  return c.code === 0
    ? null
    : `vl check should compile clean, exited ${c.code} (${c.stage}): ${head(c.text)}`;
};

const rejectDivergence = async (rel: string): Promise<string | null> => {
  const r = await checkRun(rel, false);
  if (r.code === 0) return "expected rejection, vl check exited 0";
  // The front end must catch it — an invalid program must never slip past the
  // type-check gate into the emitter (which would mask an unsound accept).
  if (r.stage !== "parse" && r.stage !== "type") {
    return `rejected at "${r.stage}" stage, expected parse/type — the checker should catch this BEFORE emit\n  ${head(r.text, 2)}`;
  }
  return null;
};

const emitRejectDivergence = async (rel: string): Promise<string | null> => {
  const r = await checkRun(rel, true);
  if (r.code === 0) {
    return "expected an emit-stage rejection, vl check --codegen exited 0";
  }
  if (r.stage !== "emit") {
    return `rejected at "${r.stage}" stage, expected emit — an earlier-stage reject belongs in the REJECT tier\n  ${head(r.text, 2)}`;
  }
  // The message text is every diagnostic's own `message`, which is the same string the
  // pretty renderer prints — the `@emit-error` fragments match it unchanged.
  for (const want of emitErrorsOf(src(rel))) {
    if (!foldMsg(r.text).includes(foldMsg(want))) {
      return `expected the emit error to contain ${JSON.stringify(want)}\n  got: ${head(r.text, 3)}`;
    }
  }
  return null;
};

/** The whole tier assertion for one case, entirely per-spawn (no batch). */
const tierDivergence = async (rel: string, tier: Tier): Promise<string | null> => {
  switch (tier) {
    case "run":
      return runDivergence(rel, await runOne(rel)) ??
        await checkCleanDivergence(rel);
    case "trap":
      return trapDivergence(await runOne(rel));
    case "reject":
      return await rejectDivergence(rel);
    case "accept":
      return await checkCleanDivergence(rel);
    case "emit-reject":
      return await emitRejectDivergence(rel);
  }
};

// One-time fixture, registered FIRST: build the batch here so its cost (the
// dominant per-suite cost — process spawns + wasmtime engine builds + running
// every RUN/TRAP case through the seed) is attributed to THIS named step
// instead of silently landing on whichever per-case test happens to run first.
// The batch stays lazy, so a filtered run that never touches RUN/TRAP cases
// still never pays for it; per-case assertions are untouched.
Deno.test({
  name: "native-align setup: vl run --batch waves (one-time fixture; whole-batch cost lands here)",
  ignore: !ENABLED,
  fn: async () => {
    const results = await batchResults();
    if (results.size === 0) {
      throw new Error("vl run --batch produced no per-case results");
    }
    // Queue every per-case `vl check` behind the batch, so the sequential
    // per-case tests below mostly COLLECT results instead of starting them.
    // Deliberately AFTER the batch await (the batch waves spawn outside
    // `spawnGate`, so overlapping the two would oversubscribe a small runner) and
    // deliberately NOT awaited: `spawnGate` bounds the in-flight count, and the
    // owning test still awaits — and reports — its own case.
    warmChecks();
  },
});

for (const rel of TIERS.run) {
  Deno.test({
    name: `native-align run: ${rel} — vl run stdout == @log, vl check clean`,
    ignore: !ENABLED,
    fn: async () => {
      const why = runDivergence(rel, (await batchResults()).get(rel)!) ??
        await checkCleanDivergence(rel);
      if (why) throw new Error(`${rel}: ${why}`);
    },
  });
}

for (const rel of TIERS.trap) {
  Deno.test({
    name: `native-align trap: ${rel} — vl run traps (nonzero exit)`,
    ignore: !ENABLED,
    fn: async () => {
      const why = trapDivergence((await batchResults()).get(rel)!);
      if (why) throw new Error(`${rel}: ${why}`);
    },
  });
}

for (const rel of TIERS.reject) {
  Deno.test({
    name: `native-align reject: ${rel} — vl check rejects at parse/type`,
    ignore: !ENABLED,
    fn: async () => {
      const why = await rejectDivergence(rel);
      if (why) throw new Error(`${rel}: ${why}`);
    },
  });
}

for (const rel of TIERS.accept) {
  Deno.test({
    name: `native-align accept: ${rel} — vl check compiles clean`,
    ignore: !ENABLED,
    fn: async () => {
      const why = await checkCleanDivergence(rel);
      if (why) throw new Error(`${rel}: ${why}`);
    },
  });
}

for (const rel of TIERS["emit-reject"]) {
  Deno.test({
    name: `native-align emit-reject: ${rel} — vl check --codegen rejects at emit`,
    ignore: !ENABLED,
    fn: async () => {
      const why = await emitRejectDivergence(rel);
      if (why) throw new Error(`${rel}: ${why}`);
    },
  });
}

// ── Tripwires: the exclusions and the discovery itself must stay honest ───────
for (const { rel, tier } of EXCLUDED) {
  Deno.test({
    name: `native-align exclusion: ${rel} — still diverges (${tier} tier)`,
    ignore: !ENABLED,
    fn: async () => {
      if ((await tierDivergence(rel, tier)) === null) {
        throw new Error(
          `${rel}: the native tool now AGREES — delete its EXCLUSIONS entry so the case is asserted.\n` +
            `  recorded reason: ${EXCLUSIONS[rel]}`,
        );
      }
    },
  });
}

Deno.test({
  name: "native-align coverage: every corpus case lands in exactly one tier",
  ignore: !ENABLED,
  fn: () => {
    const stale = Object.keys(EXCLUSIONS).filter((rel) =>
      !EXCLUDED.some((e) => e.rel === rel)
    );
    if (stale.length) {
      throw new Error(
        `EXCLUSIONS names ${stale.length} case(s) discovery does not place in a tier ` +
          `(moved, renamed, or deleted): ${stale.join(", ")}`,
      );
    }
    if (AMBIGUOUS.length) {
      throw new Error(
        `${AMBIGUOUS.length} case(s) declare directives for more than one tier — the ` +
          `verdicts contradict:\n  ${
            AMBIGUOUS.map((a) => `${a.rel} → ${a.tiers.join(" + ")}`).join("\n  ")
          }`,
      );
    }
    // A file this suite adjudicates NOTHING about must be a module part or a
    // shared helper — i.e. it must declare no directive at all. A directive this
    // classifier does not route would otherwise be covered by silence.
    const orphans = UNCLASSIFIED
      .map((rel) => ({ rel, d: anyDirective(src(rel)) }))
      .filter((o) => o.d !== undefined);
    if (orphans.length) {
      throw new Error(
        `${orphans.length} case(s) carry a directive no tier claims — teach ` +
          `tiersOf() about it or add an EXCLUSIONS entry:\n  ${
            orphans.map((o) => `${o.rel} → @${o.d}`).join("\n  ")
          }`,
      );
    }
  },
});
