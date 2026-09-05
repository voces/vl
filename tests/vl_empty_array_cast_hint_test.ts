// NATIVE `vl check --json` over the numeric-only `as` refusal's empty-array-literal suffix
// (D1641, from the external consumer glean). EXACT message comparison, which is the half
// `tests/cases/numerics/error-as-cast-empty-array-literal.vl` cannot do: an `@error`
// directive matches by SUBSTRING, so the corpus tier passes whether the suffix is there or
// not, and the NEGATIVE CONTROLS — every other operand, which must keep the bare sentence —
// are invisible to it entirely, since the bare text is a prefix of the suffixed one.
//
// The rows are the row's two faces (the cast refuses with or without the annotations) and
// the three operands the advice would be FALSE for: a string, a non-empty list value, and a
// non-empty array literal.
//
// GATING: same as tests/vl_unknown_type_suggestion_test.ts — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-empty-array-cast-hint] skipped — missing vl binary or seed wasm.");
}

type Diag = { severity: string; message: string };

const BARE = "`as` supports numeric conversions only";
const HINTED = BARE +
  "; write `[]` — an empty array literal takes its element type from its destination";

// Every ERROR message the checker reports for `src`, in order.
const errorsOf = async (dir: string, src: string): Promise<string[]> => {
  const file = `${dir}/x.vl`;
  await Deno.writeTextFile(file, src);
  const { stdout } = await new Deno.Command(VL, {
    args: ["check", file, "--json", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  const out = new TextDecoder().decode(stdout).trim();
  const parsed = JSON.parse(out) as Diag[];
  return parsed.filter((d) => d.severity === "error").map((d) => d.message);
};

const eq = (got: string[], want: string[], what: string) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

Deno.test({
  name: "empty-array `as` cast: glean's witness names the spelling that works",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_empty_arr_cast_" });
    try {
      // VERBATIM from the report. The refusal is CORRECT — `as` is numeric by design — so
      // what the suffix adds is the construction, not a lifted rule.
      eq(
        await errorsOf(
          dir,
          "function f(m: u8[], off: i32): u8[] { if off < 0 { return [] as u8[] } m.slice(off, off + 2) }\n" +
            "const b: u8[] = [1, 2, 3, 4]\nprint(f(b, 1).length)\n",
        ),
        [HINTED],
        "glean's annotated witness",
      );
      // The un-annotated face: the destination's element type reaches the empty literal
      // either way, so the same advice is true and the same sentence is owed.
      eq(
        await errorsOf(
          dir,
          "function f(m: u8[], off) { if off < 0 { return [] as u8[] } m.slice(off, off + 2) }\n" +
            "const b: u8[] = [1, 2, 3, 4]\nprint(f(b, 1).length)\n",
        ),
        [HINTED],
        "the un-annotated face",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "empty-array `as` cast: NEGATIVE CONTROLS — every other operand keeps the bare text",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_empty_arr_cast_" });
    try {
      // A string operand: the target is a numeric scalar, and deleting the cast does not
      // make the program legal, so the advice would be false.
      eq(
        await errorsOf(dir, "const s = \"x\"\nprint(s as i32)\n"),
        [BARE],
        "a string operand",
      );
      // A non-empty LIST VALUE: its element type is already pinned, so `[]`'s rule does not
      // apply and there is no spelling of this conversion.
      eq(
        await errorsOf(dir, "const xs: i32[] = [1, 2]\nconst ys = xs as u8[]\nprint(ys.length)\n"),
        [BARE],
        "a non-empty list value",
      );
      // A non-empty array LITERAL: the same, and the closest shape to the one that is
      // hinted — only the EMPTY literal takes its element type from its destination.
      eq(
        await errorsOf(dir, "const ys = [1, 2] as u8[]\nprint(ys.length)\n"),
        [BARE],
        "a non-empty array literal",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
