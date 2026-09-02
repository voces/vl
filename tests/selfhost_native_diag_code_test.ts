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
  // An INFERRED nullable i32-KEYED MAP return is type-valid; codegen cannot lower it
  // un-annotated (the annotated `: {[i32]: i32} | null` spelling of the same function
  // builds and runs).
  //
  // THE WITNESS HAS MOVED TWICE, AND WHY IS THE POINT OF THE TEST. It was
  // `print(pick(true))` over an `i32 | string`, which now RUNS — D712 built the box-tag
  // dispatch, because every arm of that union is inside `print`'s declared domain. It was
  // then an inferred nullable-STRUCT return, which now runs too — D887 recorded that shape's
  // inferred-return row so the A20 pass and `emitReturnValue` could take the arms the
  // annotated path already had. What this test pins is the CHANNEL (a capability admission
  // carries a stable code), so any still-open capability gap serves as its witness.
  // D956 closed the string-keyed MAP at every value type and it moved a FOURTH time, to
  // `i64[] | null`; D1062 closed the nullable LIST at every element type, which is why it
  // has moved a FIFTH. What still floors here is the i32-KEYED map — `nullableRetName`'s
  // map arm requires a `string` key — and its annotated twin runs, so it is a capability
  // gap and this will move again.
  // `scripts/capability-probes/inferred-nullable-container-return.vl` and
  // `inferred-nullable-list-return.vl` are the standing probes for the closed halves; when
  // the rest closes, this moves again.
  const { rc, diags } = check(
    exp,
    [
      "function pick(c: boolean) {",
      "  if c { return null }",
      "  const m: {[i32]: i32} = Map()",
      "  m",
      "}",
      "function go() {",
      "  const r = pick(true)",
      "  if r == null { print(0) } else { print(1) }",
      "}",
      "go()",
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

// THE PRINT DOMAIN IS A RULE, AND THAT IS THE ASSERTION. `print` takes one value of
// `(i32 | i64 | f32 | f64 | boolean | string)` (`typecheck.printDomainStr`, which
// `driver.builtinScan` also renders as the LSP completion detail). A CONTAINER is outside
// that domain, so it is refused as an ordinary out-of-domain argument — a plain type error
// with NO category code, because the language has never said
// what `print([1, 2, 3])` OUTPUTS (D711).
//
// ITS OLD TWIN IS GONE, AND THE ASYMMETRY IS THE LESSON. A boxed VALUE UNION is INSIDE the
// domain — every arm prints on its own — so it was never a rule and never a rendering
// question, only a missing tag dispatch, and D712 built it: `print(<i32 | string>)` runs
// (`tests/cases/types/print-union-runs.vl`). The test to keep is this one, and its point is
// that the container refusal must NOT drift onto the capability channel. It did, for the
// container arms of a UNION: `i32 | i32[]` printed "not yet supported by codegen" while
// `i32 | (() => i32)` printed the domain sentence, one rule wearing two sentences decided
// by whether the box ABI happened to give the arm a code. Both are the domain sentence now.
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
