// A lint rule that enforces the VL tree's own policy fires only inside that tree.
//
// Every code `compiler/lint.vl` emits is classified in docs/internals/lint-rule-scope.md
// as LANGUAGE (useful to any VL user) or INTERNAL (the repo's own policy, ratcheted by
// a script under `scripts/`). The INTERNAL ones decline for any path their ratchet does
// not cover — and a file outside any VL checkout reaches `lint()` with the path "",
// which no ratchet covers. That was not so: the comment rules excluded only `std/`, so
// a consumer's `vl check` and editor both reported `comment-shouting` against a rubric
// in a repo the consumer does not have.
//
// One fixture trips every INTERNAL code when it sits at `compiler/x.vl`, plus
// `prefer-const` as the LANGUAGE control. Three placements, each through both faces:
// the CLI (`vl check`, relative to a temp root, the shape lint-self.sh uses; and by
// absolute path, the shape a consumer uses) and the editor (`wasmChecker.lint`, fed
// the path `lintPathFor` answers — undefined outside a checkout).
//
// The CLI half is env-gated (`SELFHOST_NATIVE_ALIGN=1`) and needs the binary; the
// editor half needs only the seed.
//
// @test-timing native

import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { lintPathFor, resetVlRootCache } from "../lsp/src/vlRoot.ts";
import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

/** The INTERNAL codes this fixture trips under `compiler/`. `comment-block-too-long`,
 * `comment-history` and `comment-shouting` share one block; the measurement line
 * carries `comment-measurement-uncited`. */
const INTERNAL = [
  "arena-scan-outside-pass",
  "comment-block-too-long",
  "comment-history",
  "comment-measurement-uncited",
  "comment-shouting",
  "compiler-no-interpolation",
  "kind-ladder-incomplete",
  "sentinel-index-unguarded",
] as const;
/** The LANGUAGE control: it fires wherever the file sits. */
const LANGUAGE = "prefer-const";

const FIXTURE = `type Node = { nKid: i32 }
let nodes: Node[] = []
let sNames: string[] = []

// a block that runs past the four-line budget on purpose
// second line
// third line, which was slower before the rewrite
// fourth line measured 3,000 calls at 45 ms each
// fifth line, ALWAYS SHOUTING here
function holeOf(n: Node) {
  if n.nKid < 0 { return -1 }
  n.nKid
}
function readIt(n: Node) {
  const kid = nodes[n.nKid]
  kid.nKid
}
function pick(k: string): i32 {
  if k == "nulbool" { return 1 }
  if k == "f64list" { return 2 }
  if k == "u8list" { return 3 }
  -1
}
function perThing(seed: i32) {
  let i = 0
  let n = seed
  while i < sNames.length {
    n = n + i
    i = i + 1
  }
  n
}
function label(x: i32): string { "n=\\{x}" }
let total = holeOf({ nKid: 1 }) + readIt({ nKid: 0 }) + pick("x") + perThing(1)
print(label(total))
`;

type Codes = Set<string>;

const internalIn = (codes: Codes): string[] => INTERNAL.filter((c) => codes.has(c));

/** The placement under test must carry no INTERNAL code and still carry the control. */
const wantConsumer = (where: string, codes: Codes) => {
  const leaked = internalIn(codes);
  if (leaked.length !== 0) {
    throw new Error(
      `${where}: a repo-policy code fired outside the VL tree: ${JSON.stringify(leaked)}`,
    );
  }
  if (!codes.has(LANGUAGE)) {
    throw new Error(
      `${where}: the LANGUAGE control ${LANGUAGE} must still fire, got ${JSON.stringify([...codes])}`,
    );
  }
};

/** The in-tree placement must carry every INTERNAL code, so the consumer cases above
 * cannot pass by a fixture that trips nothing. */
const wantInTree = (where: string, codes: Codes) => {
  const missing = INTERNAL.filter((c) => !codes.has(c));
  if (missing.length !== 0 || !codes.has(LANGUAGE)) {
    throw new Error(
      `${where}: want every INTERNAL code and ${LANGUAGE}; missing ` +
        `${JSON.stringify(missing)}, got ${JSON.stringify([...codes])}`,
    );
  }
};

const withTree = async (fn: (dir: string) => Promise<void> | void) => {
  const dir = await Deno.makeTempDir({ prefix: "vl_lint_rule_scope_" });
  try {
    await Deno.mkdir(`${dir}/compiler`);
    await Deno.mkdir(`${dir}/src/compiler`, { recursive: true });
    await Deno.writeTextFile(`${dir}/compiler/x.vl`, FIXTURE);
    await Deno.writeTextFile(`${dir}/src/compiler/x.vl`, FIXTURE);
    await Deno.writeTextFile(`${dir}/main.vl`, FIXTURE);
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

// ── the CLI face ────────────────────────────────────────────────────────────

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const CLI = GATED && exists(VL) && exists(COMPILER);
if (GATED && !CLI) {
  console.warn("[vl-lint-rule-scope] CLI half skipped — missing vl binary or seed wasm.");
}

const cliCodes = async (cwd: string, target: string): Promise<Codes> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", target, "--severity", "info", "--json", "--compiler", COMPILER],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  if (code > 1) {
    throw new Error(`vl check ${target} exited ${code}: ${new TextDecoder().decode(stderr)}`);
  }
  const all = JSON.parse(new TextDecoder().decode(stdout)) as { code?: string }[];
  return new Set(all.map((d) => d.code ?? ""));
};

Deno.test({
  name: "lint rule scope (CLI): a consumer path and a foreign src/compiler/ get no INTERNAL code; compiler/ does",
  ignore: !CLI,
  fn: () =>
    withTree(async (dir) => {
      // A file outside any checkout, by absolute path: `lintScopeKeyOf` answers "".
      wantConsumer("absolute main.vl", await cliCodes("/", `${dir}/main.vl`));
      wantConsumer(
        "absolute src/compiler/x.vl",
        await cliCodes("/", `${dir}/src/compiler/x.vl`),
      );
      // Relative to its own root, the shape a consumer runs from their project.
      wantConsumer("relative main.vl", await cliCodes(dir, "main.vl"));
      wantConsumer("relative src/compiler/x.vl", await cliCodes(dir, "src/compiler/x.vl"));
      wantInTree("relative compiler/x.vl", await cliCodes(dir, "compiler/x.vl"));
    }),
});

// ── the editor face ─────────────────────────────────────────────────────────

const SEED = exists(COMPILER);

Deno.test({
  name: "lint rule scope (editor): the path lintPathFor answers keeps INTERNAL codes out of a consumer file",
  ignore: !SEED,
  fn: () =>
    withTree((dir) => {
      resetVlRootCache();
      const checker = loadWasmChecker(COMPILER, () => {})!;
      const codesAt = (path: string | undefined): Codes =>
        new Set(checker.lint(FIXTURE, path).map((d) => String(d.code)));

      // The temp root is no VL checkout, so the server stages nothing — "" in the seed.
      const staged = lintPathFor(`${dir}/main.vl`);
      if (staged !== undefined) {
        throw new Error(`lintPathFor outside a checkout: want undefined, got ${staged}`);
      }
      wantConsumer("editor, no checkout", codesAt(staged));
      wantConsumer("editor, src/compiler/x.vl", codesAt("src/compiler/x.vl"));
      wantInTree("editor, compiler/x.vl", codesAt("compiler/x.vl"));
      // And back: a consumer file after an in-tree one sees no carried-over path.
      wantConsumer("editor, no checkout again", codesAt(undefined));
    }),
});
