// NATIVE corpus alignment — the self-hosted `vl` binary, end to end, with zero
// TS/deno/V8 in the compile+run path (deno only DISCOVERS cases, parses their
// directives, and ASSERTS the verdict; the brains run in the native tool).
//
// The corpus oracle (`tests/cases_wasm_test.ts`) proves the VL pipeline AGREES
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

type Run = { code: number; out: string; err: string };
const vl = async (args: string[]): Promise<Run> => {
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
};
const stageOf = (err: string) => err.match(/(parse|type|emit) error/)?.[1] ?? "other";

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
  "soundness/README.vl":
    "the soundness directory's INDEX, not a case — its prose explanation of the directive vocabulary contains a line-leading `@run`, which the scan reads as a directive; the file's real directive is `@check` and it declares no top-level statement for the emitter to lower",
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
// "wasm trap". The `vl check` legs stay per-spawn (`vl check` takes one path).
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
  const c = await vl(["check", path(rel)]);
  return c.code === 0
    ? null
    : `vl check should compile clean, exited ${c.code} (${stageOf(c.err)}): ${head(c.err)}`;
};

const rejectDivergence = async (rel: string): Promise<string | null> => {
  const r = await vl(["check", path(rel)]);
  if (r.code === 0) return "expected rejection, vl check exited 0";
  const stage = stageOf(r.err);
  // The front end must catch it — an invalid program must never slip past the
  // type-check gate into the emitter (which would mask an unsound accept).
  if (stage !== "parse" && stage !== "type") {
    return `rejected at "${stage}" stage, expected parse/type — the checker should catch this BEFORE emit\n  ${head(r.err, 2)}`;
  }
  return null;
};

const emitRejectDivergence = async (rel: string): Promise<string | null> => {
  const r = await vl(["check", "--codegen", path(rel)]);
  if (r.code === 0) {
    return "expected an emit-stage rejection, vl check --codegen exited 0";
  }
  const all = r.out + r.err;
  const stage = stageOf(all);
  if (stage !== "emit") {
    return `rejected at "${stage}" stage, expected emit — an earlier-stage reject belongs in the REJECT tier\n  ${head(all, 2)}`;
  }
  for (const want of emitErrorsOf(src(rel))) {
    if (!foldMsg(all).includes(foldMsg(want))) {
      return `expected the emit error to contain ${JSON.stringify(want)}\n  got: ${head(all, 3)}`;
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
