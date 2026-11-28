// THE GATE ROWS CI ALREADY RUNS (scripts/ci-proof.sh rows).
//
// `ci-proof.sh rows` lists the gate.sh rows a pull request's CI runs with the same command on
// the same seed, so a lane does not re-run them (lane-brief.md). This holds that list to ci.yml:
// every gate.sh row is either covered or named local here, every covered row's command is one
// ci.yml runs, and every setup-deno reads .dvmrc. No assertion library, per CLAUDE.md.

import { ROOT } from "./support/tree.ts";

const ci = Deno.readTextFileSync(`${ROOT}/.github/workflows/ci.yml`);
const gate = Deno.readTextFileSync(`${ROOT}/scripts/gate.sh`);
const dec = new TextDecoder();

function sh(cwd: string, cmd: string): string {
  const out = new Deno.Command("bash", {
    args: ["-c", cmd],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  if (!out.success) {
    throw new Error(`command failed: ${cmd}\n${dec.decode(out.stderr)}`);
  }
  return dec.decode(out.stdout).trim();
}

const lines = (s: string) => s.split("\n").filter((l) => l !== "");
const COVERED = lines(sh(ROOT, "bash scripts/ci-proof.sh rows"));

// The gate rows a proof does not cover, each with what CI lacks for it.
const LOCAL: Record<string, string> = {
  "deno task test":
    "the ci job runs it without a seed (its oracle part is `corpus oracle`)",
  "self-compile pair":
    "CI proves the fixpoint (seed) and the L2 fuel and heap tripwire (ci-cost 2), not the survey rows; gate.sh builds its seed from the pair",
  "plumb-shape cost":
    "ci-cost runs it with --require-fuel and no native binaryen",
  "filed witnesses":
    "ci-witnesses grades it in two --shard runs, not the one command the row runs",
  "distilled corpus":
    "ci-distilled runs its runs-lost check; on master gate.sh adds --verify-fresh",
};

// What ci.yml must run for each covered row: fragments of the same command, on the seed.
const CI_RUNS: Record<string, string[]> = {
  "ci-native": [
    "bash scripts/ci-shard.sh native ${{ matrix.shard }} 5",
    "bash scripts/ci-shard.sh release ${{ matrix.shard }} 1",
  ],
  "lsp suites (ci list)": ["- name: Editor features on the wasm compiler"],
  "lsp typecheck": [
    "run: deno check --node-modules-dir=none --config lsp/deno.json lsp/src/*.ts",
  ],
  "lsp lint": ["run: deno lint --config lsp/deno.json lsp/src/"],
  "lint-self + fmt": ["./scripts/lint-self.sh"],
  "seed size": [
    "vl run scripts/seed-size.vl --compiler build/vl-compiler.wasm -- --check",
  ],
  "late demands": [
    "vl run scripts/late-demands.vl --compiler build/vl-compiler.wasm -- --check --seed build/vl-compiler.wasm",
  ],
  "phase state": [
    "vl run scripts/phase-state-census.vl --compiler build/vl-compiler.wasm -- --check",
  ],
  "no-python": ["vl run scripts/no-python.vl"],
  "kind-ladder sets": [
    "vl run scripts/ladder-sets.vl --compiler build/vl-compiler.wasm",
  ],
  "dead-export budget": [
    "vl run scripts/dead-exports.vl --compiler build/vl-compiler.wasm",
    "check --budget scripts/export-budget-baseline.json --findings",
  ],
  "render-parse budget": [
    "vl run scripts/render-parse-census.vl --compiler build/vl-compiler.wasm",
    "check --budget scripts/render-parse-budget-baseline.json --findings",
  ],
  "scaling shape": [
    "run: deno test --preload tests/support/signal_guard.ts -A --no-check tests/vl_scaling_shape_test.ts",
  ],
  "deno lint": ["run: deno lint\n"],
  "inventory refs": [],
  "capability probes": [
    "-- --live-sites --compiler build/vl-compiler.wasm",
    "-- --floor --compiler build/vl-compiler.wasm",
  ],
  "conflict markers": [],
  "corpus oracle": ["- name: Corpus oracle on the wasm compiler"],
  "rep-fuzz": ["run: bash scripts/rep-fuzz-check.sh"],
  "ir debt": [
    "vl run scripts/ir-debt.vl --compiler build/vl-compiler.wasm -- --check",
  ],
  "splice scan": [
    "vl run scripts/inventory/splice-scan.vl --compiler build/vl-compiler.wasm -- --self-test",
  ],
};

// Top-level jobs of ci.yml, name -> body.
function jobs(): Map<string, string> {
  const body = ci.slice(ci.indexOf("\njobs:\n"));
  const out = new Map<string, string>();
  const heads = [...body.matchAll(/^ {2}([a-z][a-z0-9-]*):\n/gm)];
  heads.forEach((m, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : body.length;
    out.set(m[1], body.slice(m.index, end));
  });
  return out;
}

Deno.test("ci-proof: every gate row is covered or local, and nothing else is either", () => {
  const rows = [...gate.matchAll(/^\s*run "([^"]+)"/gm)].map((m) => m[1]);
  const uniq = [...new Set(rows)];
  for (const r of uniq) {
    const cov = COVERED.includes(r), loc = r in LOCAL;
    if (cov === loc) {
      throw new Error(
        `gate row "${r}": want it in exactly one of ci-proof.sh's rows and LOCAL, got ${
          cov ? "both" : "neither"
        }`,
      );
    }
  }
  for (const r of COVERED) {
    if (r !== "corpus oracle" && !uniq.includes(r)) {
      throw new Error(
        `ci-proof.sh covers "${r}", want a gate.sh row of that name, got none`,
      );
    }
    if (!(r in CI_RUNS)) {
      throw new Error(
        `ci-proof.sh covers "${r}", want its ci.yml command in CI_RUNS, got none`,
      );
    }
  }
  for (const r of Object.keys(LOCAL)) {
    if (!uniq.includes(r)) {
      throw new Error(`LOCAL names "${r}", want a gate.sh row, got none`);
    }
  }
});

Deno.test("ci-proof: each covered row's command is one ci.yml runs on the restored seed", () => {
  for (const [row, frags] of Object.entries(CI_RUNS)) {
    for (const f of frags) {
      if (!ci.includes(f)) {
        throw new Error(`row "${row}": want ci.yml to run "${f}", got none`);
      }
    }
  }
  // gate.sh's ci-native row and its two own-row scans are the native and release shards'
  // files: run the shard script for every shard and compare with gate.sh's own glob.
  const shards: string[] = [];
  for (let k = 1; k <= 7; k++) {
    shards.push(
      ...lines(
        sh(ROOT, `bash scripts/ci-shard.sh native ${k} 7`).replace(/ /g, "\n"),
      ),
    );
  }
  for (let k = 1; k <= 4; k++) {
    shards.push(
      ...lines(
        sh(ROOT, `bash scripts/ci-shard.sh release ${k} 4`).replace(/ /g, "\n"),
      ),
    );
  }
  const inCi = new Set(shards);
  const want = lines(
    sh(ROOT, "ls tests/selfhost_native_*_test.ts tests/vl_*_test.ts"),
  )
    .filter((f) => f !== "tests/vl_scaling_shape_test.ts");
  for (const f of want) {
    if (!inCi.has(f)) {
      throw new Error(
        `${f}: gate.sh runs it under a covered row, want it in a CI shard, got none`,
      );
    }
  }
  for (
    const f of [
      "tests/vl_inventory_refs_test.ts",
      "tests/vl_no_conflict_markers_test.ts",
    ]
  ) {
    if (!inCi.has(f)) throw new Error(`want ${f} in a native shard, got none`);
  }
  const all = jobs();
  for (const j of ["ci-native", "ci-release-shape"]) {
    if (!/SELFHOST_NATIVE_ALIGN: "1"/.test(all.get(j) ?? "")) {
      throw new Error(
        `want ${j} to run with SELFHOST_NATIVE_ALIGN=1 as gate.sh's row does, got none`,
      );
    }
  }
  for (const f of lines(sh(ROOT, "ls tests/cases_wasm_*_test.ts"))) {
    if (!(all.get("checks-suites") ?? "").includes(f)) {
      throw new Error(
        `want checks-suites to run ${f} (the corpus oracle), got none`,
      );
    }
  }
});

Deno.test("ci-proof: every setup-deno in ci.yml reads .dvmrc", () => {
  const setups = [
    ...ci.matchAll(/uses: denoland\/setup-deno@v2\n\s+with:\n\s+(.*)\n/g),
  ].map((m) => m[1]);
  if (
    setups.length === 0 || setups.some((s) => s !== "deno-version-file: .dvmrc")
  ) {
    throw new Error(
      `want every setup-deno to read .dvmrc, got ${setups.join(" | ")}`,
    );
  }
  const v = Deno.readTextFileSync(`${ROOT}/.dvmrc`).trim();
  if (!/^\d+\.\d+\.\d+$/.test(v)) {
    throw new Error(`want .dvmrc to name one exact deno, got "${v}"`);
  }
});
