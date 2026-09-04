// NATIVE `vl check --json` over the `unknown type` diagnostic's `did you mean` suffix
// (D1590, from the external consumer glean's report VL-039). EXACT message comparison, which
// is the half `tests/cases/types/unknown-type-did-you-mean.vl` cannot do: an `@error`
// directive matches by SUBSTRING, so the corpus tier passes whether the suffix is there or
// not, and it cannot see the NEGATIVE CONTROL at all — a name with nothing near it must keep
// the bare text, and only an equality check says so.
//
// The four rows are the four sources of a verdict: glean's own witness (a map VALUE, so the
// suffix lands after the `within '<shape>'` clause), the newcomer spelling map, the edit
// distance against a DECLARED type, and the name with no neighbour.
//
// GATING: same as tests/vl_check_json_test.ts — env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND
// requires the built binary + seed wasm.

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
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-unknown-type-suggestion] skipped — missing vl binary or seed wasm.");
}

type Diag = { severity: string; message: string };

// Every ERROR message the checker reports for `src`, in order.
const errorsOf = async (dir: string, src: string): Promise<string[]> => {
  const file = `${dir}/x.vl`;
  await Deno.writeTextFile(file, src);
  const { stdout } = await new Deno.Command(VL, {
    args: ["check", file, "--json", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
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
  name: "unknown-type suggestion: glean VL-039's `{[i32]: bool}` names `boolean`",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_unk_ty_sugg_" });
    try {
      // VERBATIM from the report. The failing COMPONENT is `bool`, so the suffix names the
      // component's replacement and not the shape's — and it follows the `within` clause,
      // which every existing consumer of this diagnostic matches on as a prefix.
      eq(
        await errorsOf(dir, "const seen: {[i32]: bool} = Map()\nprint(0)\n"),
        ["unknown type 'bool' within '{[i32]:bool}'; did you mean 'boolean'?"],
        "glean VL-039's witness",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "unknown-type suggestion: the newcomer spelling map, and it grants no types",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_unk_ty_sugg_" });
    try {
      eq(
        await errorsOf(dir, "const n: int = 1\nprint(n)\n"),
        ["unknown type 'int'; did you mean 'i32'?"],
        "`int` names `i32`",
      );
      // Case is FOLDED, so the capitalised spellings other languages use land too.
      eq(
        await errorsOf(dir, "const s: String = \"a\"\nprint(s)\n"),
        ["unknown type 'String'; did you mean 'string'?"],
        "`String` names `string`",
      );
      eq(
        await errorsOf(dir, "const d: double = 1.5\nprint(d)\n"),
        ["unknown type 'double'; did you mean 'f64'?"],
        "`double` names `f64`",
      );
      // THE REFUSAL IS UNCHANGED. A mapped spelling is still not a type: the program is
      // rejected, and the annotation resolves to nothing. Naming the VL spelling is the whole
      // of what the map does.
      const still = await errorsOf(dir, "const b: bool = true\nprint(b)\n");
      if (still.length !== 1) {
        throw new Error(`\`bool\` must still be refused, got: ${JSON.stringify(still)}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "unknown-type suggestion: an edit distance reaches a DECLARED type",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_unk_ty_sugg_" });
    try {
      eq(
        await errorsOf(
          dir,
          "type Circle = { r: f64 }\n\nconst c: Cricle = { r: 1.0 }\nprint(c.r)\n",
        ),
        ["unknown type 'Cricle'; did you mean 'Circle'?"],
        "a transposed user type",
      );
      // The clause a call site appends of its own (`for field '<f>'`, `in union '<u>'`) stays
      // BEFORE the suggestion, so `did you mean` always ends the sentence.
      eq(
        await errorsOf(
          dir,
          "type Circle = { r: f64 }\ntype S = { f: Cricle }\n\nconst s: S = { f: { r: 1.0 } }\nprint(s.f.r)\n",
        ),
        ["unknown type 'Cricle' for field 'f'; did you mean 'Circle'?"],
        "the field clause keeps its place",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "unknown-type suggestion: NEGATIVE CONTROL — no neighbour, no suffix",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_unk_ty_sugg_" });
    try {
      // `Zork` is 4 characters, so the budget is one edit; nothing in scope is that close.
      // A wrong guess is worse than none, which is what this equality defends.
      eq(
        await errorsOf(dir, "type Circle = { r: f64 }\n\nconst z: Zork = 1\nprint(z)\n"),
        ["unknown type 'Zork'"],
        "nothing near `Zork`",
      );
      // A one-character name is never matched either — every candidate is a suggestion at
      // distance >= 1 and the offer would be noise.
      eq(
        await errorsOf(dir, "const q: Q = 1\nprint(q)\n"),
        ["unknown type 'Q'"],
        "a one-character name",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
