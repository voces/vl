// A CI RUN STANDS IN FOR A GATE ROW ONLY ON THE SAME INPUTS (scripts/ci-proof.sh).
//
// Two halves. The structural half holds the covered row list to ci.yml: every gate.sh row is
// either covered or named local here, every covered row's command is one ci.yml runs, the
// `ci-proof` job waits on every other job, the job counts ci-proof.sh requires are ci.yml's
// matrices, and every setup-deno reads .dvmrc. The behavioural half runs ci-proof.sh in a
// scratch repository against a fake `gh`, `deno` and `rustc`, and mutates each input the key
// covers in turn: every mutation must be refused. No assertion library, per CLAUDE.md.

import { ROOT } from "./support/tree.ts";

const ci = Deno.readTextFileSync(`${ROOT}/.github/workflows/ci.yml`);
const gate = Deno.readTextFileSync(`${ROOT}/scripts/gate.sh`);
const SCRIPT = `${ROOT}/scripts/ci-proof.sh`;
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
const REQUIRED = lines(sh(ROOT, "bash scripts/ci-proof.sh jobs"));

// The gate rows a proof does not cover, each with what CI lacks for it.
const LOCAL: Record<string, string> = {
  "deno task test":
    "the ci job runs it without a seed (its oracle part is `corpus oracle`)",
  "self-compile pair":
    "CI proves the fixpoint, not the fuel, heap or survey rows",
  "plumb-shape cost":
    "ci-cost runs it with --require-fuel and no native binaryen",
  "rep-fuzz": "CI does not run it",
  "filed witnesses": "CI does not run it",
  "splice scan": "CI does not run it",
  "distilled corpus": "CI does not run it",
};

// What ci.yml must run for each covered row: fragments of the same command, on the seed.
const CI_RUNS: Record<string, string[]> = {
  "ci-native": [
    "bash scripts/ci-shard.sh native ${{ matrix.shard }} 7",
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
    "run: deno test -A --no-check tests/vl_scaling_shape_test.ts",
  ],
  "deno lint": ["run: deno lint\n"],
  "inventory refs": [],
  "capability probes": [
    "-- --live-sites --compiler build/vl-compiler.wasm",
    "-- --floor --compiler build/vl-compiler.wasm",
  ],
  "conflict markers": [],
  "corpus oracle": ["- name: Corpus oracle on the wasm compiler"],
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
  if (!gate.includes('[[ "$CI_PROVEN" == *"|corpus oracle|"* ]]')) {
    throw new Error(
      "want gate.sh to drop the oracle from row 1 under a proof, got no such test",
    );
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

Deno.test("ci-proof: the proof job waits on every job, and the counts are ci.yml's", () => {
  const all = jobs();
  const proof = all.get("ci-proof") ?? "";
  const needs =
    proof.match(/^ {4}needs: \[([^\]]*)\]$/m)?.[1].split(",").map((s) =>
      s.trim()
    ) ?? [];
  const others = [...all.keys()].filter((j) => j !== "ci-proof");
  if (needs.slice().sort().join(",") !== others.slice().sort().join(",")) {
    throw new Error(
      `want ci-proof to need ${others.join(", ")}, got ${needs.join(", ")}`,
    );
  }
  if (
    !proof.includes("startsWith(github.ref, 'refs/heads/vl-queue/')") ||
    !proof.includes("always()")
  ) {
    throw new Error(
      "want ci-proof to run on every vl-queue push whatever its needs did, got another condition",
    );
  }
  if (
    !proof.includes('select(.value.result != "success")') ||
    !proof.includes('[ "$HEAVY" = true ] && [ "$GATED" != true ]')
  ) {
    throw new Error(
      "want ci-proof to fail unless every need passed on a heavy, ungated run, got another check",
    );
  }
  if (!/^ {4}branches: \[master, "vl-queue\/\*\*"\]$/m.test(ci)) {
    throw new Error("want ci.yml's push trigger to name vl-queue/**, got none");
  }
  const docsOnly = Deno.readTextFileSync(
    `${ROOT}/.github/actions/docs-only/action.yml`,
  );
  if (!docsOnly.includes("refs/heads/vl-queue/*)")) {
    throw new Error(
      "want docs-only to answer false on a vl-queue push, got no such arm",
    );
  }
  for (const r of REQUIRED) {
    const [name, n] = r.split("=");
    const body = all.get(name);
    if (body === undefined) {
      throw new Error(
        `ci-proof.sh requires job ${name}, want it in ci.yml, got none`,
      );
    }
    const m = body.match(/^ {8}(?:shard|part): \[([^\]]*)\]$/m);
    const want = m ? m[1].split(",").length : 1;
    if (Number(n) !== want) {
      throw new Error(
        `job ${name}: want ci-proof.sh to require ${want}, got ${n}`,
      );
    }
  }
  const named = new Set(REQUIRED.map((r) => r.split("=")[0]));
  for (
    const j of [
      "ci",
      "seed",
      "ci-native",
      "ci-release-shape",
      "checks",
      "checks-suites",
      "ci-cost",
    ]
  ) {
    if (!named.has(j)) {
      throw new Error(`want ci-proof.sh to require job ${j}, got none`);
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

// --- behavioural half ------------------------------------------------------------------

const hasJq = new Deno.Command("bash", {
  args: ["-c", "command -v jq && command -v sha256sum"],
})
  .outputSync().success;

// `gh api <path> [--jq <filter>]` over $FAKE/<key>.json, or the log text for a job's logs.
const FAKE_GH = `#!/usr/bin/env bash
path=$2; filter=\${4:-}
case "$path" in
  */actions/runs\\?head_sha=*) k=runs.json;;
  */actions/runs/*/jobs*) k=jobs.json;;
  */actions/jobs/*/logs) cat "$FAKE/log.txt"; exit;;
  *) exit 1;;
esac
[ -f "$FAKE/$k" ] || exit 1
jq -r "$filter" < "$FAKE/$k"
`;

const RUSTC = "rustc 1.99.0 (b940084d7 2026-09-28)";
const RUSTC_KEY = RUSTC.replace(/ /g, "_");

function jobList(
  drop = "",
  edit: (j: { conclusion: string; name: string }[]) => void = () => {},
) {
  const out: { id: number; conclusion: string; name: string }[] = [];
  let id = 100;
  for (const r of REQUIRED) {
    const [name, n] = r.split("=");
    for (let k = 1; k <= Number(n); k++) {
      const full = Number(n) === 1 ? name : `${name} (${k})`;
      if (full !== drop) {
        out.push({ id: id++, conclusion: "success", name: full });
      }
    }
  }
  out.push({ id: id++, conclusion: "success", name: "ci-embed-seed" });
  edit(out);
  return JSON.stringify({ jobs: out });
}

function proofRun(sha: string, over: Record<string, unknown> = {}) {
  return JSON.stringify({
    workflow_runs: [{
      id: 42,
      path: ".github/workflows/ci.yml",
      event: "push",
      head_sha: sha,
      head_repository: { id: 1 },
      repository: { id: 1 },
      created_at: "2026-10-17T00:00:00Z",
      status: "completed",
      conclusion: "success",
      html_url: "https://example/run/42",
      ...over,
    }],
  });
}

Deno.test({
  name: "ci-proof: the baseline is accepted and every mutated input is refused",
  ignore: !hasJq,
  fn() {
    const dir = Deno.makeTempDirSync({ prefix: "ci-proof-" });
    try {
      const repo = `${dir}/repo`, fake = `${dir}/fake`;
      Deno.mkdirSync(`${fake}/bin`, { recursive: true });
      const bin = (n: string, s: string) => {
        Deno.writeTextFileSync(`${fake}/bin/${n}`, s);
        Deno.chmodSync(`${fake}/bin/${n}`, 0o755);
      };
      bin("gh", FAKE_GH);
      bin(
        "deno",
        '#!/usr/bin/env bash\necho "deno $FAKE_DENO (stable, release, x86_64-unknown-linux-gnu)"\n',
      );
      bin("rustc", '#!/usr/bin/env bash\necho "$FAKE_RUSTC"\n');
      Deno.mkdirSync(`${repo}/.github/workflows`, { recursive: true });
      const g = (c: string) => sh(repo, c);
      const yml = (pin: string) =>
        "jobs:\n  a:\n    steps:\n      - uses: denoland/setup-deno@v2\n        with:\n          deno-version-file: .dvmrc\n" +
        `  b:\n    steps:\n      - uses: denoland/setup-deno@v2\n        with:\n          ${pin}\n`;
      Deno.writeTextFileSync(
        `${repo}/.github/workflows/ci.yml`,
        yml("deno-version-file: .dvmrc"),
      );
      Deno.writeTextFileSync(`${repo}/.dvmrc`, "2.9.6\n");
      Deno.writeTextFileSync(`${repo}/.gitignore`, "build/\n");
      Deno.writeTextFileSync(`${repo}/a`, "a\n");
      g("git init -q -b master && git config user.email t@t && git config user.name t && git add -A && git commit -qm base");
      const other = g("git rev-parse HEAD");
      g("echo b > b && git add b && git commit -qm next");
      const sha = g("git rev-parse HEAD");
      const tree = g("git rev-parse HEAD^{tree}");
      Deno.mkdirSync(`${repo}/build`);
      Deno.writeTextFileSync(`${repo}/build/vl-compiler.wasm`, "seed bytes");
      const seed = g("sha256sum build/vl-compiler.wasm | cut -d' ' -f1");
      const line = (t = tree, s = seed, r = RUSTC_KEY) =>
        `2026-10-17T00:00:00Z ci-proof: tree ${t} seed ${s} rustc ${r}\n`;

      const write = (k: string, v: string) =>
        Deno.writeTextFileSync(`${fake}/${k}`, v);
      const reset = () => {
        write("runs.json", proofRun(sha));
        write("jobs.json", jobList());
        write("log.txt", "echo the line\n" + line());
        Deno.writeTextFileSync(`${repo}/build/vl-compiler.wasm`, "seed bytes");
        g(`git checkout -q --detach ${sha} && git reset -q --hard && git clean -qfd`);
      };
      const run = (env: Record<string, string> = {}, target = sha) => {
        const out = new Deno.Command("bash", {
          args: [SCRIPT, "verify", target, "build/vl-compiler.wasm"],
          cwd: repo,
          env: {
            FAKE: fake,
            PATH: `${fake}/bin:${Deno.env.get("PATH")}`,
            REPO: "o/r",
            FAKE_DENO: "2.9.6",
            FAKE_RUSTC: RUSTC,
            ...env,
          },
          stdout: "piped",
          stderr: "piped",
        }).outputSync();
        return {
          code: out.code,
          out: dec.decode(out.stdout),
          err: dec.decode(out.stderr),
        };
      };

      reset();
      const ok = run();
      if (ok.code !== 0 || lines(ok.out).join("|") !== COVERED.join("|")) {
        throw new Error(
          `baseline: want rc 0 and the covered rows, got rc ${ok.code}: ${ok.err}`,
        );
      }

      const failed = (
        j: { conclusion: string; name: string }[],
        name: string,
        c: string,
      ) => {
        const x = j.find((e) => e.name === name);
        if (x) x.conclusion = c;
      };
      const cases: [
        string,
        () => void,
        Record<string, string>,
        string,
        string,
      ][] = [
        ["another commit's tree", () => {}, {}, "has tree", other],
        [
          "a commit this checkout lacks",
          () => {},
          {},
          "is not in this checkout",
          "f".repeat(40),
        ],
        [
          "a tracked file edited",
          () => Deno.writeTextFileSync(`${repo}/a`, "edited\n"),
          {},
          "differs from its tree",
          sha,
        ],
        [
          "an untracked file",
          () => Deno.writeTextFileSync(`${repo}/new.vl`, "x\n"),
          {},
          "differs from its tree",
          sha,
        ],
        [
          "other seed bytes",
          () =>
            Deno.writeTextFileSync(`${repo}/build/vl-compiler.wasm`, "other"),
          {},
          "graded seed",
          sha,
        ],
        [
          "no seed",
          () => Deno.removeSync(`${repo}/build/vl-compiler.wasm`),
          {},
          "no seed at",
          sha,
        ],
        [
          "another deno",
          () => {},
          { FAKE_DENO: "2.9.7" },
          "CI runs deno 2.9.6",
          sha,
        ],
        [
          "a setup-deno off .dvmrc",
          () => {
            Deno.writeTextFileSync(
              `${repo}/.github/workflows/ci.yml`,
              yml("deno-version: v2.x"),
            );
            g("git commit -qam unpinned");
            write("runs.json", proofRun(g("git rev-parse HEAD")));
          },
          {},
          "1 of 2 setup-deno steps",
          "HEAD",
        ],
        [
          "another rustc",
          () => {},
          { FAKE_RUSTC: "rustc 1.100.0 (x 2026-11-01)" },
          "built its host with",
          sha,
        ],
        [
          "a failed job",
          () =>
            write(
              "jobs.json",
              jobList("", (j) => failed(j, "ci-native (3)", "failure")),
            ),
          {},
          "ci-native (3) failure",
          sha,
        ],
        [
          "a skipped job",
          () =>
            write(
              "jobs.json",
              jobList("", (j) => failed(j, "checks", "skipped")),
            ),
          {},
          "checks skipped",
          sha,
        ],
        [
          "an extra job failed",
          () =>
            write(
              "jobs.json",
              jobList("", (j) => failed(j, "ci-embed-seed", "cancelled")),
            ),
          {},
          "ci-embed-seed cancelled",
          sha,
        ],
        [
          "a missing shard",
          () => write("jobs.json", jobList("ci-native (7)")),
          {},
          "has 6 'ci-native' jobs",
          sha,
        ],
        [
          "a missing scaling part",
          () => write("jobs.json", jobList("ci-cost (2)")),
          {},
          "has 3 'ci-cost' jobs",
          sha,
        ],
        [
          "no proof job",
          () => write("jobs.json", jobList("ci-proof")),
          {},
          "has 0 'ci-proof' jobs",
          sha,
        ],
        [
          "a pull_request run",
          () => write("runs.json", proofRun(sha, { event: "pull_request" })),
          {},
          "no push-event CI run",
          sha,
        ],
        [
          "another workflow",
          () =>
            write(
              "runs.json",
              proofRun(sha, { path: ".github/workflows/fuzz-nightly.yml" }),
            ),
          {},
          "no push-event CI run",
          sha,
        ],
        [
          "a fork's head",
          () =>
            write("runs.json", proofRun(sha, { head_repository: { id: 2 } })),
          {},
          "no push-event CI run",
          sha,
        ],
        [
          "another head",
          () => write("runs.json", proofRun(other)),
          {},
          "no push-event CI run",
          sha,
        ],
        [
          "no run at all",
          () => write("runs.json", JSON.stringify({ workflow_runs: [] })),
          {},
          "no push-event CI run",
          sha,
        ],
        [
          "unreadable runs",
          () => Deno.removeSync(`${fake}/runs.json`),
          {},
          "could not be read",
          sha,
        ],
        [
          "a run in progress",
          () =>
            write(
              "runs.json",
              proofRun(sha, { status: "in_progress", conclusion: null }),
            ),
          {},
          "is in_progress",
          sha,
        ],
        [
          "a failed run",
          () => write("runs.json", proofRun(sha, { conclusion: "failure" })),
          {},
          "concluded failure",
          sha,
        ],
        [
          "no proof line",
          () => write("log.txt", "no proof: checks=failure\n"),
          {},
          "printed no proof line",
          sha,
        ],
        [
          "two proof lines",
          () => write("log.txt", line() + line(tree, "0".repeat(64))),
          {},
          "2 different proof lines",
          sha,
        ],
        [
          "a proof of another tree",
          () => write("log.txt", line("1".repeat(40))),
          {},
          "graded tree",
          sha,
        ],
        [
          "a proof of another seed",
          () => write("log.txt", line(tree, "0".repeat(64))),
          {},
          "graded seed",
          sha,
        ],
        [
          "a proof under another rustc",
          () => write("log.txt", line(tree, seed, "rustc_1.98.0")),
          {},
          "built its host with",
          sha,
        ],
      ];
      for (const [what, mutate, env, want, target] of cases) {
        reset();
        mutate();
        const t = target === "HEAD" ? g("git rev-parse HEAD") : target;
        const r = run(env, t);
        if (r.code !== 1 || r.out !== "" || !r.err.includes(want)) {
          throw new Error(
            `${what}: want rc 1, no rows and "${want}", got rc ${r.code}, rows "${r.out.trim()}": ${r.err}`,
          );
        }
        g(`git checkout -q --detach ${sha}`);
      }
      // A run still in progress is waited for, and accepted once it completes.
      reset();
      write(
        "runs.json",
        proofRun(sha, { status: "in_progress", conclusion: null }),
      );
      bin(
        "sleep",
        `#!/usr/bin/env bash\ncp "$FAKE/done.json" "$FAKE/runs.json"\n`,
      );
      write("done.json", proofRun(sha));
      const waited = run({ CI_PROOF_WAIT: "60", CI_PROOF_POLL: "0" });
      if (waited.code !== 0) {
        throw new Error(
          `wait: want rc 0 once the run completes, got rc ${waited.code}: ${waited.err}`,
        );
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
