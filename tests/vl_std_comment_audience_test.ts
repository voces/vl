// `std-comment-audience` fires on a PLANTED violation, and only under `std/`.
//
// std's comments are its API surface (`docs/internals/std-api-review.md` §4), and
// the rule that keeps them that way lands at ZERO with no ratchet — so the tree
// itself is not evidence the rule still works. A green `lint-self.sh` looks the
// same whether the rule is enforcing or has quietly stopped firing. This plants
// each of the four violations and demands the finding.
//
// The CONTROL is the same file under a directory that is not `std/`: the rule is
// module-scoped by the path the CLI hands to the linter, and a scoping bug would
// otherwise show up as noise in every other tree rather than as a red here. Both
// are checked as RELATIVE targets from a temp root, because the scope is a target
// rooted at `std/` — the shape `lint-self.sh`'s `vl check std/` produces — and not
// a `/std/` anywhere, which would hold someone else's `src/std/` to this rubric.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary +
// seed wasm, like the other native `vl_*` suites.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const CODE = "std-comment-audience";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-std-comment-audience] skipped — missing vl binary or seed wasm.");
}

// An 11-line header, a row id, a date + PR + internal vocabulary in one block, a
// 5-line doc comment on an export — and two shapes that must STAY quiet: a
// 5-line block on a private helper, and a 5-line banner separated from the doc
// comment it precedes by a blank line.
const FIXTURE = `// \`std:dirty\` — a probe module.
// line 2
// line 3
// line 4
// line 5
// line 6
// line 7
// line 8
// line 9
// line 10
// line 11
export function a(): i32 { 1 }

// D1042 says this arm was wrong.
export function b(): i32 { 2 }

// The emitter picks the rep here on 2026-09-03, see DECISIONS.md (#2437).
export function c(): i32 { 3 }

// one
// two
// three
// four
// five
export function d(): i32 { 4 }

// one
// two
// three
// four
// five
function priv(): i32 { 5 }

// ── a banner over five lines ──
// two
// three
// four
// five

// short doc
export function e(): i32 { priv() }
`;

/** The `std-comment-audience` findings on `path` (relative to `cwd`). */
const findings = async (
  cwd: string,
  path: string,
): Promise<{ line: number; message: string }[]> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--severity", "info", "--json", "--compiler", COMPILER],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  if (code > 1) {
    throw new Error(`vl check ${path} exited ${code}: ${new TextDecoder().decode(stderr)}`);
  }
  const all = JSON.parse(new TextDecoder().decode(stdout)) as {
    code?: string;
    line: number;
    message: string;
  }[];
  return all.filter((d) => d.code === CODE).map((d) => ({ line: d.line, message: d.message }));
};

Deno.test({
  name: "std-comment-audience: the planted violations fire, and only under std/",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_std_audience_" });
    await Deno.mkdir(`${dir}/std`);
    await Deno.mkdir(`${dir}/lib`);
    const dirty = "std/dirty.vl";
    const control = "lib/dirty.vl";
    await Deno.writeTextFile(`${dir}/${dirty}`, FIXTURE);
    await Deno.writeTextFile(`${dir}/${control}`, FIXTURE);

    const hits = await findings(dir, dirty);
    const lines = hits.map((h) => h.line).sort((a, b) => a - b);
    const want = [1, 14, 17, 20];
    if (JSON.stringify(lines) !== JSON.stringify(want)) {
      throw new Error(
        `${CODE} on std/dirty.vl: want findings at lines ${JSON.stringify(want)} ` +
          `(11-line header, row id, internal vocabulary, 5-line export doc), got ` +
          `${JSON.stringify(lines)} — ${JSON.stringify(hits)}. A 5-line block on a ` +
          `private helper and a 5-line banner must NOT be reported.`,
      );
    }

    const says = (line: number, want: string) => {
      const h = hits.find((x) => x.line === line);
      if (!h || !h.message.includes(want)) {
        throw new Error(
          `${CODE} at line ${line}: want a message containing ${JSON.stringify(want)}, ` +
            `got ${JSON.stringify(h?.message ?? null)}`,
        );
      }
    };
    says(1, "module header of 11 lines exceeds the 10-line budget");
    says(14, "an inventory row id");
    says(17, "compiler-internal vocabulary");
    says(20, "doc comment of 5 lines exceeds the 4-line budget");

    const quiet = await findings(dir, control);
    if (quiet.length !== 0) {
      throw new Error(
        `${CODE} fired on ${control}, which is not under std/: got ` +
          `${JSON.stringify(quiet)}. The rule is module-scoped; a scoping bug turns ` +
          `every other tree's comments into findings.`,
      );
    }

    await Deno.remove(dir, { recursive: true });
  },
});
