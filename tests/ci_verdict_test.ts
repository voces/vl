// CI REPEATS ONLY WHAT NOTHING ELSE PROVED (scripts/ci-verdict.sh, .github/actions/ci-verdict).
//
// Two halves. The structural half holds ci.yml's `tree` skip to ci-verdict.sh's TREE_SKIPS and
// the verdict's wiring into the jobs that start a run. The behavioural half runs ci-verdict.sh in a scratch repository against a fake `gh` that
// answers from fixtures through the real `jq`, and checks every refusal answers `full`.
// No assertion library, per CLAUDE.md.

import { ROOT } from "./support/tree.ts";

const ci = Deno.readTextFileSync(`${ROOT}/.github/workflows/ci.yml`);
const SCRIPT = `${ROOT}/scripts/ci-verdict.sh`;

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
    "ci-witnesses (1)",
    "ci-witnesses (2)",
    "ci-ir-identity (1)",
    "ci-ir-identity (2)",
    "ci-i8-sweep",
  ];
  return JSON.stringify({
    jobs: names.map((name, i) => ({
      id: name === "seed" ? 500 : 501 + i,
      name,
      conclusion: over[name] ?? "success",
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
  name: "ci-verdict: inherit, tree and every refusal",
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
      // A catch-up whose master side changed the compiler since the branch's merge base.
      g("git checkout -q master && mkdir -p compiler && echo c > compiler/c.vl && git add compiler && git commit -qm compiler");
      const codeBase = g("git rev-parse HEAD");
      g("git checkout -qb code " + before + " && git merge -q --no-edit master");
      const code = g("git rev-parse HEAD");
      g("git checkout -q master && git reset -q --hard " + base);
      g("git checkout -q master && git merge -q --squash pr && git commit -qm 'change (#7)'");
      const squash = g("git rev-parse HEAD");
      const tree = g("git rev-parse HEAD^{tree}");

      const write = (k: string, v: string) =>
        Deno.writeTextFileSync(`${fake}/${k}.json`, v);
      // The jobs an inherited run must have passed: every top-level job.
      Deno.writeTextFileSync(
        `${dir}/ci.yml`,
        "on: push\njobs:\n  ci:\n    runs-on: x\n  seed:\n    runs-on: x\n  ci-ir-identity:\n    runs-on: x\n",
      );
      const pr = (head: string) => ({
        EVENT: "pull_request",
        ACTION: "synchronize",
        HEAD_REPO: "o/r",
        PR_HEAD: head,
        PR_BEFORE: before,
        PR_BASE: base,
        CI_YML: `${dir}/ci.yml`,
      });
      const push = { EVENT: "push", REF: "refs/heads/master", SHA: squash };
      const cases: [string, Record<string, string>, string, () => void][] = [
        [
          "clean catch-up, previous head green",
          pr(clean),
          "inherit",
          () => {
            write(`runs-${before}`, runs("success"));
            write("jobs-99", runJobs());
          },
        ],
        [
          "clean catch-up that brings a master compiler/ change, previous head green",
          { ...pr(code), PR_BASE: codeBase },
          "full",
          () => {},
        ],
        [
          "clean catch-up, previous head green but it ran no job ci.yml added since",
          pr(clean),
          "full",
          () =>
            write(
              "jobs-99",
              JSON.stringify({
                jobs: JSON.parse(runJobs()).jobs.filter((j: { name: string }) =>
                  !j.name.startsWith("ci-ir-identity")
                ),
              }),
            ),
        ],
        [
          "clean catch-up, previous head green but it skipped a job",
          pr(clean),
          "full",
          () =>
            write(
              "jobs-99",
              runJobs({
                "ci-ir-identity (1)": "skipped",
                "ci-ir-identity (2)": "skipped",
                "ci-i8-sweep": "skipped",
              }),
            ),
        ],
        [
          "clean catch-up, previous head green, its jobs unreadable",
          pr(clean),
          "full",
          () => Deno.removeSync(`${fake}/jobs-99.json`),
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
        [
          "the job asked only for inherit",
          { ...push, MODES: "inherit" },
          "full",
          () => {},
        ],
        ["head CI red", push, "full", () => {
          write(
            "pull-7",
            JSON.stringify({
              merged: true,
              merge_commit_sha: squash,
              head: { sha: clean },
            }),
          );
          write(`runs-${clean}`, runs("failure"));
        }],
        ["PR merged as another commit", push, "full", () => {
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
          write(`runs-${clean}`, runs("success"));
          write("jobs-99", runJobs());
          write("ann-500", annotation(tree));
        }],
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
                "ci-witnesses (1)": "skipped",
                "ci-witnesses (2)": "skipped",
                "ci-ir-identity (1)": "skipped",
                "ci-ir-identity (2)": "skipped",
                "ci-i8-sweep": "skipped",
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
