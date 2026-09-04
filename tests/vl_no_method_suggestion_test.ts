// NATIVE `vl check --json` over the `no method` / `unknown property` diagnostics' `did you
// mean` suffix (D1599, the method twin of D1590, from the external consumer glean's report
// VL-045). EXACT message comparison, which is the half
// `tests/cases/methods/no-method-did-you-mean.vl` cannot do: an `@error` directive matches
// by SUBSTRING, so the corpus tier passes whether the suffix is there or not, and it cannot
// see the NEGATIVE CONTROL at all — a name with nothing near it must keep the bare text.
//
// The rows: glean's own witness (a call-shape replacement), a string and a list edit
// distance, an in-scope UFCS edit distance, the map/set newcomer-map split (D1599's own
// finding — a Map's failed call is `unknown property`, not `no method`, and a Set must not
// be offered the Map-only names), and the name with no neighbour.
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
  console.warn("[vl-no-method-suggestion] skipped — missing vl binary or seed wasm.");
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
  name: "no-method suggestion: glean VL-045's `s.charAt(i)` names `.slice(i, i + 1)`",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_no_method_sugg_" });
    try {
      // VERBATIM shape from the report. `charAt` takes different arguments from `slice`, so
      // the suggestion carries the whole call, not a bare name.
      eq(
        await errorsOf(dir, "const s = \"hello\"\nconst i = 1\nprint(s.charAt(i))\n"),
        ["no method '.charAt' on string; did you mean '.slice(i, i + 1)'?"],
        "glean VL-045's witness",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "no-method suggestion: an edit distance reaches a string or list intrinsic",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_no_method_sugg_" });
    try {
      eq(
        await errorsOf(dir, "const s = \"hello\"\nprint(s.silce(0, 1))\n"),
        ["no method '.silce' on string; did you mean '.slice'?"],
        "a transposed string intrinsic",
      );
      eq(
        await errorsOf(dir, "const xs = [1, 2, 3]\nprint(xs.pusch(4))\n"),
        ["no method '.pusch' on array i32[]; did you mean '.push'?"],
        "a transposed array intrinsic",
      );
      // The newcomer map, exact and case-folded — none of these become real methods.
      eq(
        await errorsOf(dir, "const s = \"hello\"\nprint(s.toUpperCase())\n"),
        ["no method '.toUpperCase' on string; did you mean '.toUpperAscii'?"],
        "`toUpperCase` names `toUpperAscii`",
      );
      eq(
        await errorsOf(dir, "const xs = [1, 2, 3]\nprint(xs.contains(1))\n"),
        ["no method '.contains' on array i32[]; did you mean '.includes'?"],
        "`contains` names `includes`",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "no-method suggestion: an edit distance reaches an IN-SCOPE self-function",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_no_method_sugg_" });
    try {
      // `toUpperAscii` is not an intrinsic — it resolves only because the import puts it in
      // scope, mirroring `ufcsCallTy`'s own lookup. A correct call keeps the import USED so
      // this case tests only the suggestion, not an unrelated unused-import warning.
      eq(
        await errorsOf(
          dir,
          `import { toUpperAscii } from "std:str"\n\nconst s = "hello"\nprint(s.toUpperAscii())\nprint(s.toUpperAscci())\n`,
        ),
        ["no method '.toUpperAscci' on string; did you mean '.toUpperAscii'?"],
        "an in-scope import, typo'd",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "no-method suggestion: a Map's failed call is `unknown property`, and a Set is not offered the Map-only names",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_no_method_sugg_" });
    try {
      eq(
        await errorsOf(
          dir,
          "const m: {[string]: i32} = Map()\nm.put(\"a\", 1)\nprint(0)\n",
        ),
        ["unknown property `put` on {[string]: i32}; did you mean '.set'?"],
        "`put` names `set` on a real map",
      );
      eq(
        await errorsOf(
          dir,
          "const m: {[string]: i32} = Map()\nm.containsKey(\"a\")\nprint(0)\n",
        ),
        ["unknown property `containsKey` on {[string]: i32}; did you mean '.has'?"],
        "`containsKey` names `has`",
      );
      // A SET must not be offered `.set` — `checkCallNode`'s own Set arm refuses it, so
      // offering it would name a call that itself does not resolve.
      eq(
        await errorsOf(
          dir,
          "const st: {[string]: boolean} = Set()\nst.put(\"a\")\nprint(0)\n",
        ),
        ["unknown property `put` on {[string]: boolean}"],
        "a set keeps the bare text for `put`",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "no-method suggestion: NEGATIVE CONTROL — no neighbour, no suffix",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_no_method_sugg_" });
    try {
      // `zorptastic` sits far from every string method in scope; nothing is offered. A wrong
      // guess is worse than none, which is what this equality defends.
      eq(
        await errorsOf(dir, "print(\"hello\".zorptastic())\n"),
        ["no method '.zorptastic' on string"],
        "nothing near `zorptastic`",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
