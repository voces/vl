// CI REPEATS ONLY WHAT NOTHING ELSE PROVED (scripts/ci-verdict.sh, .github/actions/ci-verdict).
//
// Two halves. The structural half holds ci.yml's `gated` skip to the jobs scripts/gate.sh runs
// whole on the queue's merged tree: a job that runs anything gate.sh does not (the V8 corpus
// oracle, the emitter-state audit, the LSP bundle, the embed-seed build) must not carry it.
// The behavioural half runs ci-verdict.sh in a scratch repository against a fake `gh` that
// answers from fixtures through the real `jq`, and checks every refusal answers `full`.
// No assertion library, per CLAUDE.md.

import { ROOT } from "./support/tree.ts";

const ci = Deno.readTextFileSync(`${ROOT}/.github/workflows/ci.yml`);
const gate = Deno.readTextFileSync(`${ROOT}/scripts/gate.sh`);
const SCRIPT = `${ROOT}/scripts/ci-verdict.sh`;

// The jobs `gated` may skip, each with the gate.sh row that runs its content.
const GATE_COVERED: Record<string, string> = {
  "ci-native": "ci-native",
  "ci-release-shape": "ci-native",
  "ci-cost": "scaling shape",
};

// Top-level jobs of ci.yml, name -> body.
function jobs(): Map<string, string> {
  const body = ci.slice(ci.indexOf("\njobs:\n"));
  const out = new Map<string, string>();
  const re = /^ {2}([a-z][a-z0-9-]*):\n/gm;
  const heads = [...body.matchAll(re)];
  heads.forEach((m, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : body.length;
    out.set(m[1], body.slice(m.index, end));
  });
  return out;
}

const jobIf = (b: string) => b.match(/^ {4}if: (.*)$/m)?.[1] ?? "";

Deno.test("ci-verdict: `gated` skips exactly the jobs scripts/gate.sh runs whole", () => {
  const all = jobs();
  const gated = [...all].filter(([, b]) =>
    jobIf(b).includes("needs.seed.outputs.gated != 'true'")
  )
    .map(([n]) => n).sort();
  const want = Object.keys(GATE_COVERED).sort();
  if (gated.join(",") !== want.join(",")) {
    throw new Error(
      `want gated-skippable jobs ${want.join(", ")}, got ${gated.join(", ")}`,
    );
  }
  for (const [job, row] of Object.entries(GATE_COVERED)) {
    if (!gate.includes(`run "${row}"`)) {
      throw new Error(
        `${job} is skipped on a gated tree because gate.sh row "${row}" runs it; want that row in scripts/gate.sh, got none`,
      );
    }
    const body = all.get(job)!;
    // Every test file the job names must be one gate.sh's ci-native row globs.
    for (const [f] of body.matchAll(/tests\/[A-Za-z0-9_]+\.ts/g)) {
      const name = f.slice("tests/".length);
      if (
        !/^selfhost_native_.*_test\.ts$/.test(name) &&
        !/^vl_.*_test\.ts$/.test(name)
      ) {
        throw new Error(
          `${job} runs ${f}, which gate.sh's ci-native globs do not; want it out of a gated-skippable job`,
        );
      }
    }
    for (const [s] of body.matchAll(/scripts\/[A-Za-z0-9_./-]+\.vl/g)) {
      if (!gate.includes(s)) {
        throw new Error(
          `${job} runs ${s}, which scripts/gate.sh does not; want it out of a gated-skippable job`,
        );
      }
    }
  }
  if (!gate.includes("ls tests/selfhost_native_*_test.ts tests/vl_*_test.ts")) {
    throw new Error(
      "want gate.sh's ci-native row to glob tests/selfhost_native_*_test.ts tests/vl_*_test.ts, got another set",
    );
  }
});

// The jobs a `tree` verdict skips: ci-verdict.sh's TREE_SKIPS, each of which the PR's run must
// have passed. seed (the proven seed master's consumers restore), ci and ci-cost (a master
// reading caught #5373's hang) are never among them.
Deno.test("ci-verdict: `tree` skips exactly ci-verdict.sh's TREE_SKIPS, never seed, ci or ci-cost", () => {
  const script = Deno.readTextFileSync(SCRIPT);
  const listed = (script.match(/^TREE_SKIPS="([^"]*)"$/m)?.[1] ?? "").split(" ")
    .filter(Boolean).sort();
  if (listed.length === 0) {
    throw new Error("want TREE_SKIPS in ci-verdict.sh, got none");
  }
  const all = jobs();
  const skipped = [...all].filter(([, b]) =>
    jobIf(b).includes("needs.seed.outputs.tree != 'true'") ||
    b.includes("steps.verdict.outputs.tree != 'true'")
  ).map(([n]) => n).sort();
  if (skipped.join(",") !== listed.join(",")) {
    throw new Error(
      `want tree-skippable jobs ${listed.join(", ")}, got ${
        skipped.join(", ")
      }`,
    );
  }
  for (const j of ["seed", "ci", "ci-cost"]) {
    if (listed.includes(j)) {
      throw new Error(
        `want ${j} never skipped on a tree verdict, got it in TREE_SKIPS`,
      );
    }
  }
});

Deno.test("ci-verdict: the jobs that start a run decide, and the seed hands the verdict on", () => {
  const all = jobs();
  const modes: Record<string, string> = {
    ci: "inherit",
    seed: "",
    "ci-embed-seed": "inherit tree",
  };
  for (const [job, mode] of Object.entries(modes)) {
    const b = all.get(job) ?? "";
    if (!b.includes("uses: ./.github/actions/ci-verdict")) {
      throw new Error(
        `want job ${job} to run ./.github/actions/ci-verdict, got none`,
      );
    }
    if (mode && !b.includes(`modes: ${mode}`)) {
      throw new Error(
        `want job ${job} to ask only for "${mode}", got another mode set`,
      );
    }
    if (!/^ {6}actions: read$/m.test(b)) {
      throw new Error(
        `want job ${job} to hold actions: read for the verdict lookup, got none`,
      );
    }
  }
  const seed = all.get("seed") ?? "";
  for (
    const o of [
      "heavy: ${{ steps.verdict.outputs.heavy }}",
      "gated: ${{ steps.verdict.outputs.gated }}",
      "tree: ${{ steps.verdict.outputs.tree }}",
    ]
  ) {
    if (!seed.includes(o)) throw new Error(`want seed output "${o}", got none`);
  }
  if (ci.includes("needs.seed.outputs.docs_only")) {
    throw new Error(
      "want downstream jobs to read needs.seed.outputs.heavy, got a docs_only read",
    );
  }
});

// --- behavioural half ------------------------------------------------------------------

const hasJq =
  new Deno.Command("bash", { args: ["-c", "command -v jq"] }).outputSync()
    .success;

function sh(cwd: string, cmd: string): string {
  const out = new Deno.Command("bash", {
    args: ["-c", cmd],
    cwd,
    stdout: "piped",
    stderr: "piped",
  })
    .outputSync();
  const dec = new TextDecoder();
  if (!out.success) {
    throw new Error(`setup command failed: ${cmd}\n${dec.decode(out.stderr)}`);
  }
  return dec.decode(out.stdout).trim();
}

// `gh api <path> --jq <filter>` over $FAKE/<key>.json, where the key names the endpoint.
const FAKE_GH = `#!/usr/bin/env bash
path=$2; filter=$4
case "$path" in
  */actions/runs\\?head_sha=*) k=runs-$(sed -E 's/.*head_sha=([0-9a-f]+).*/\\1/' <<< "$path");;
  */pulls/*) k=pull-\${path##*/};;
  */commits/*/statuses*) k=statuses-$(sed -E 's#.*/commits/([0-9a-f]+)/.*#\\1#' <<< "$path");;
  */actions/runs/*/jobs*) k=jobs-$(sed -E 's#.*/actions/runs/([0-9]+)/jobs.*#\\1#' <<< "$path");;
  */check-runs/*/annotations) k=ann-$(sed -E 's#.*/check-runs/([0-9]+)/annotations#\\1#' <<< "$path");;
  *) exit 1;;
esac
[ -f "$FAKE/$k.json" ] || exit 1
jq -r "$filter" < "$FAKE/$k.json"
`;

function runs(conclusion: string, repo = "o/r"): string {
  return JSON.stringify({
    workflow_runs: [{
      id: 99,
      path: ".github/workflows/ci.yml",
      created_at: "2026-10-17T00:00:00Z",
      status: "completed",
      conclusion,
      head_repository: { full_name: repo },
    }],
  });
}

// A pull_request run's jobs: every job a tree verdict needs, all green unless overridden.
function runJobs(over: Record<string, string> = {}): string {
  const names = [
    "ci",
    "seed",
    "ci-embed-seed",
    "checks",
    "checks-suites (editor)",
    "checks-suites (oracle)",
    "ci-release-shape (1)",
    "ci-native (1)",
    "ci-native (2)",
    "ci-cost (1)",
    "ci-cost (2)",
    "ci-distilled",
    "ci-proof",
  ];
  return JSON.stringify({
    jobs: names.map((name, i) => ({
      id: name === "seed" ? 500 : 501 + i,
      name,
      conclusion: over[name] ?? (name === "ci-proof" ? "skipped" : "success"),
    })),
  });
}

const RUSTC = "rustc 1.99.1 (58cf8f9c3 2026-10-13)";
const annotation = (tree: string, rustc = RUSTC.replaceAll(" ", "_")) =>
  JSON.stringify([
    { title: "something else", message: "x" },
    { title: "tested-tree", message: `${tree} rustc=${rustc}` },
  ]);

function verdict(
  cwd: string,
  fake: string,
  env: Record<string, string>,
): string {
  const out = new Deno.Command("bash", {
    args: [SCRIPT],
    cwd,
    env: {
      ...env,
      FAKE: fake,
      PATH: `${fake}/bin:${Deno.env.get("PATH")}`,
      VERDICT_WAIT: "0",
      VERDICT_POLL: "0",
      GITHUB_OUTPUT: "",
      REPO: "o/r",
    },
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  const text = new TextDecoder().decode(out.stdout);
  return text.match(/mode=(\w+)/)?.[1] ??
    `no verdict (rc ${out.code}): ${text}`;
}

Deno.test({
  name: "ci-verdict: inherit, gated and every refusal",
  ignore: !hasJq,
  fn() {
    const dir = Deno.makeTempDirSync({ prefix: "ci-verdict-" });
    try {
      const repo = `${dir}/repo`, fake = `${dir}/fake`;
      Deno.mkdirSync(`${fake}/bin`, { recursive: true });
      Deno.writeTextFileSync(`${fake}/bin/gh`, FAKE_GH);
      Deno.chmodSync(`${fake}/bin/gh`, 0o755);
      Deno.writeTextFileSync(
        `${fake}/bin/rustc`,
        `#!/usr/bin/env bash\necho "${RUSTC}"\n`,
      );
      Deno.chmodSync(`${fake}/bin/rustc`, 0o755);
      Deno.mkdirSync(repo);
      const g = (c: string) => sh(repo, c);
      g("git init -q -b master && git config user.email t@t && git config user.name t");
      g("echo a > a && git add a && git commit -qm base");
      g("git checkout -qb pr && echo b > b && git add b && git commit -qm change");
      const before = g("git rev-parse HEAD");
      g("git checkout -q master && echo m > m && git add m && git commit -qm master");
      const base = g("git rev-parse HEAD");
      g("git checkout -q pr && git merge -q --no-edit master");
      const clean = g("git rev-parse HEAD");
      g(
        "git checkout -qb hand " + before +
          " && git merge -q --no-commit master && echo x >> b && git add b && git commit -qm hand",
      );
      const hand = g("git rev-parse HEAD");
      g("git checkout -q master && git merge -q --squash pr && git commit -qm 'change (#7)'");
      const squash = g("git rev-parse HEAD");
      const tree = g("git rev-parse HEAD^{tree}");

      const write = (k: string, v: string) =>
        Deno.writeTextFileSync(`${fake}/${k}.json`, v);
      const pr = (head: string) => ({
        EVENT: "pull_request",
        ACTION: "synchronize",
        HEAD_REPO: "o/r",
        PR_HEAD: head,
        PR_BEFORE: before,
        PR_BASE: base,
      });
      const push = { EVENT: "push", REF: "refs/heads/master", SHA: squash };
      const cases: [string, Record<string, string>, string, () => void][] = [
        [
          "clean catch-up, previous head green",
          pr(clean),
          "inherit",
          () => write(`runs-${before}`, runs("success")),
        ],
        [
          "clean catch-up, previous head red",
          pr(clean),
          "full",
          () => write(`runs-${before}`, runs("failure")),
        ],
        [
          "clean catch-up, previous head never ran",
          pr(clean),
          "full",
          () => Deno.removeSync(`${fake}/runs-${before}.json`),
        ],
        [
          "hand-edited merge",
          pr(hand),
          "full",
          () => write(`runs-${before}`, runs("success")),
        ],
        ["not a merge", pr(before), "full", () => {}],
        [
          "opened, not synchronize",
          { ...pr(clean), ACTION: "opened" },
          "full",
          () => {},
        ],
        ["fork head", { ...pr(clean), HEAD_REPO: "x/r" }, "full", () => {}],
        ["master push, queue mark names this tree", push, "gated", () => {
          write(
            "pull-7",
            JSON.stringify({
              merged: true,
              merge_commit_sha: squash,
              head: { sha: clean },
            }),
          );
          write(
            `statuses-${clean}`,
            JSON.stringify([{
              context: "vl-queue/gate",
              state: "success",
              description: `gated tree ${tree}`,
            }]),
          );
          write(`runs-${clean}`, runs("success"));
        }],
        [
          "the job asked only for inherit",
          { ...push, MODES: "inherit" },
          "full",
          () => {},
        ],
        [
          "head CI red",
          push,
          "full",
          () => write(`runs-${clean}`, runs("failure")),
        ],
        ["newest mark is a failure", push, "full", () => {
          write(`runs-${clean}`, runs("success"));
          write(
            `statuses-${clean}`,
            JSON.stringify([
              {
                context: "vl-queue/gate",
                state: "failure",
                description: `gated tree ${tree}`,
              },
              {
                context: "vl-queue/gate",
                state: "success",
                description: `gated tree ${tree}`,
              },
            ]),
          );
        }],
        [
          "mark names another tree",
          push,
          "full",
          () =>
            write(
              `statuses-${clean}`,
              JSON.stringify([{
                context: "vl-queue/gate",
                state: "success",
                description: "gated tree 0123",
              }]),
            ),
        ],
        ["no mark", push, "full", () => write(`statuses-${clean}`, "[]")],
        ["PR merged as another commit", push, "full", () => {
          write(
            `statuses-${clean}`,
            JSON.stringify([{
              context: "vl-queue/gate",
              state: "success",
              description: `gated tree ${tree}`,
            }]),
          );
          write(
            "pull-7",
            JSON.stringify({
              merged: true,
              merge_commit_sha: before,
              head: { sha: clean },
            }),
          );
        }],
        ["tree: the PR's own green run tested this tree", push, "tree", () => {
          write(
            "pull-7",
            JSON.stringify({
              merged: true,
              merge_commit_sha: squash,
              head: { sha: clean },
            }),
          );
          write(`statuses-${clean}`, "[]");
          write(`runs-${clean}`, runs("success"));
          write("jobs-99", runJobs());
          write("ann-500", annotation(tree));
        }],
        [
          "tree: the job asked only for gated",
          { ...push, MODES: "inherit gated" },
          "full",
          () => {},
        ],
        [
          "tree refused: the PR ran from a fork",
          push,
          "full",
          () => write(`runs-${clean}`, runs("success", "x/r")),
        ],
        ["tree refused: a job did not succeed", push, "full", () => {
          write(`runs-${clean}`, runs("success"));
          write("jobs-99", runJobs({ "checks": "failure" }));
        }],
        [
          "tree refused: the run inherited (its native shards skipped)",
          push,
          "full",
          () =>
            write(
              "jobs-99",
              runJobs({
                "ci-native (1)": "skipped",
                "ci-native (2)": "skipped",
                "ci-release-shape (1)": "skipped",
                "checks": "skipped",
                "checks-suites (editor)": "skipped",
                "checks-suites (oracle)": "skipped",
                "ci-cost (1)": "skipped",
                "ci-cost (2)": "skipped",
                "ci-distilled": "skipped",
              }),
            ),
        ],
        ["tree refused: the run tested another tree", push, "full", () => {
          write("jobs-99", runJobs());
          write(
            "ann-500",
            annotation("0123456789abcdef0123456789abcdef01234567"),
          );
        }],
        [
          "tree refused: the run built with another rustc (another binary key)",
          push,
          "full",
          () =>
            write(
              "ann-500",
              annotation(tree, "rustc_1.98.0_(aaaaaaaaa_2026-09-01)"),
            ),
        ],
        [
          "tree refused: the run recorded no tested tree",
          push,
          "full",
          () => write("ann-500", "[]"),
        ],
        [
          "push to another branch",
          { ...push, REF: "refs/heads/pr" },
          "full",
          () => {},
        ],
        [
          "nightly",
          { EVENT: "schedule", REF: "refs/heads/master", SHA: squash },
          "full",
          () => {},
        ],
      ];
      const bad: string[] = [];
      for (const [what, env, want, prep] of cases) {
        prep();
        const got = verdict(repo, fake, env);
        if (got !== want) bad.push(`${what}: want ${want}, got ${got}`);
      }
      if (bad.length > 0) throw new Error(bad.join("\n"));
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
