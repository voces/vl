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

// STAGE 2c: the element is a UTF-8 byte, not a code point.
const readString = (len: number, at: (j: number) => number): string => {
  const bytes = new Uint8Array(len);
  for (let j = 0; j < len; j++) bytes[j] = at(j);
  return new TextDecoder().decode(bytes);
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

// THE TWO PRINT REFUSALS SIT ON DIFFERENT CHANNELS, AND THAT SPLIT IS THE ASSERTION.
// `print` takes one value of `(i32 | i64 | f32 | f64 | boolean | string)`
// (`typecheck.printDomainStr`, which `driver.builtinScan` also renders as the LSP
// completion detail). A CONTAINER is outside that domain, so it is refused the way
// `toString expects an i32 or boolean, got string` is refused — a plain type error with
// NO category code. A boxed VALUE UNION is inside the domain (every arm prints on its
// own) and only the runtime tag dispatch is missing, so it keeps the
// `unsupported-lowering` admission above. `silent-class-inventory` D711/D712 carry the
// ruling and its measurement; a change that collapses the two channels reddens here.
Deno.test({
  name: "diag-code: print of a CONTAINER is a domain error, carrying no code",
  ignore,
}, () => {
  const exp = instantiate();
  const { rc, diags } = check(exp, "const xs = [1, 2, 3]\nprint(xs)\n");
  if (rc !== 2) throw new Error(`expected rc 2 (type stage), got ${rc}`);
  if (diags.length !== 1) {
    throw new Error(`expected 1 diagnostic, got: ${JSON.stringify(diags)}`);
  }
  if (diags[0].code !== "") {
    throw new Error(
      `expected an empty code (a domain error, not a capability admission), got: ${
        JSON.stringify(diags[0])
      }`,
    );
  }
  if (!diags[0].message.includes("print expects one scalar or string value")) {
    throw new Error(
      `expected the domain sentence, got: ${JSON.stringify(diags[0])}`,
    );
  }
  if (/not yet supported by codegen|no lowering/.test(diags[0].message)) {
    throw new Error(
      `a domain rejection must not concede the program is buildable: ${
        JSON.stringify(diags[0])
      }`,
    );
  }
});

// MAP EQUALITY IS THE SAME SPLIT, ONE OPERATOR OVER. `m1 == m2` used to carry the
// `unsupported-lowering` code while its one-constructor neighbour `{[string]: i32}[] == …`
// carried the SOUNDNESS sentence with no code — two channels, two verdicts, one value. A
// map's entries are insertion-ORDERED and observable that way, so `==` would have to choose
// between order-sensitive and set-like; that is a language decision, not a missing core.
// `silent-class-inventory` D754 carries the ruling. A change that puts map `==` back on the
// capability channel reddens here.
Deno.test({
  name: "diag-code: `==` over a MAP is a domain error, carrying no code",
  ignore,
}, () => {
  const exp = instantiate();
  const { rc, diags } = check(
    exp,
    "const a: {[string]: i32} = Map()\nconst b: {[string]: i32} = Map()\nprint(a == b)\n",
  );
  if (rc !== 2) throw new Error(`expected rc 2 (type stage), got ${rc}`);
  if (diags.length !== 1) {
    throw new Error(`expected 1 diagnostic, got: ${JSON.stringify(diags)}`);
  }
  if (diags[0].code !== "") {
    throw new Error(
      `expected an empty code (a domain error, not a capability admission), got: ${
        JSON.stringify(diags[0])
      }`,
    );
  }
  if (!diags[0].message.includes("a map has no defined value equality")) {
    throw new Error(
      `expected the domain sentence, got: ${JSON.stringify(diags[0])}`,
    );
  }
  if (/not yet supported by codegen|no lowering/.test(diags[0].message)) {
    throw new Error(
      `a domain rejection must not concede the program is buildable: ${
        JSON.stringify(diags[0])
      }`,
    );
  }
});
