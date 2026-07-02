// The diagnostic CATEGORY-code ABI (`diagCodeLen`/`diagCodeByte`, review N24):
// an emitter-capability rejection — a program the type system ACCEPTS but
// codegen cannot lower yet — is raised on a DISTINCT channel with the stable
// `unsupported-lowering` code, so tooling can tell codegen maturity apart from
// a type-soundness verdict. Both categories are errors (`checkSrc` rc 2): an
// unbuildable program must not pass `vl check`; only the code differs.
//
// Loads the real seed (`build/vl-compiler.wasm`) directly — absent (fresh
// clone, no `refresh-compiler.sh` yet) the tests self-ignore, the same
// convention as the other seed-driven suites.
//
// Run with:  deno test -A tests/selfhost_native_diag_code_test.ts

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;
if (ignore) {
  console.warn(
    "[diag-code] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number>;

const instantiate = (): Exports => {
  const bytes = Deno.readFileSync(SEED);
  const module = new WebAssembly.Module(bytes);
  return new WebAssembly.Instance(module, {}).exports as unknown as Exports;
};

const readString = (len: number, at: (j: number) => number): string => {
  const cps = new Array<number>(len);
  for (let j = 0; j < len; j++) cps[j] = at(j);
  return String.fromCodePoint(...cps);
};

/** Check `src` on a fresh store; return each diagnostic's `{ message, code }`. */
const check = (
  exp: Exports,
  src: string,
): { rc: number; diags: { message: string; code: string }[] } => {
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.checkSrc();
  const diags: { message: string; code: string }[] = [];
  if (rc !== 0) {
    const n = exp.diagCount();
    for (let i = 0; i < n; i++) {
      diags.push({
        message: readString(exp.diagMsgLen(i), (j) => exp.diagMsgAt(i, j)),
        code: readString(exp.diagCodeLen(i), (j) => exp.diagCodeByte(i, j)),
      });
    }
  }
  return { rc, diags };
};

Deno.test({
  name: "diag-code: an emitter-capability rejection carries `unsupported-lowering`",
  ignore,
}, () => {
  const exp = instantiate();
  // `print(<value-union>)` is type-valid; codegen cannot lower the boxed union.
  const { rc, diags } = check(
    exp,
    [
      "function pick(c: boolean): i32 | string {",
      "  if c { return 1 }",
      '  return "x"',
      "}",
      "print(pick(true))",
      "",
    ].join("\n"),
  );
  if (rc !== 2) throw new Error(`expected rc 2 (type stage), got ${rc}`);
  if (diags.length !== 1) {
    throw new Error(`expected 1 diagnostic, got: ${JSON.stringify(diags)}`);
  }
  if (diags[0].code !== "unsupported-lowering") {
    throw new Error(
      `expected code "unsupported-lowering", got: ${JSON.stringify(diags[0])}`,
    );
  }
});

Deno.test({
  name: "diag-code: a type-soundness rejection carries no code",
  ignore,
}, () => {
  const exp = instantiate();
  const { rc, diags } = check(exp, 'const x: i32 = "nope"\nprint(x)\n');
  if (rc !== 2) throw new Error(`expected rc 2 (type stage), got ${rc}`);
  if (diags.length !== 1) {
    throw new Error(`expected 1 diagnostic, got: ${JSON.stringify(diags)}`);
  }
  if (diags[0].code !== "") {
    throw new Error(`expected an empty code, got: ${JSON.stringify(diags[0])}`);
  }
});

Deno.test({
  name: "diag-code: a parse diagnostic carries no code",
  ignore,
}, () => {
  const exp = instantiate();
  const { rc, diags } = check(exp, "let = 1\n");
  if (rc !== 1) throw new Error(`expected rc 1 (parse stage), got ${rc}`);
  if (diags.length === 0) throw new Error("expected a parse diagnostic");
  for (const d of diags) {
    if (d.code !== "") {
      throw new Error(`expected an empty code, got: ${JSON.stringify(d)}`);
    }
  }
});
