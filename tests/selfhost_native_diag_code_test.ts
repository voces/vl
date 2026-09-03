// The diagnostic CATEGORY-code ABI (`diagCodeLen`/`diagCodeByte`, review N24):
// an emitter-capability rejection — a program the type system ACCEPTS but
// codegen cannot lower yet — is raised on a DISTINCT channel with the stable
// `unsupported-lowering` code, so tooling can tell codegen maturity apart from
// a type-soundness verdict. Both categories are errors (`checkSrc` rc 2): an
// unbuildable program must not pass `vl check`; only the code differs.
//
// AND ITS DATA TWIN (`diagDataLen`/`diagDataByte`). A code is a BARE CATEGORY;
// anything a category needs to say rides the parallel payload pair, netstring
// encoded (`typecheck.diagDataField`, decoded by `compiler/diagnostics.ts`
// `decodeDiagData`). Every diagnostic without one answers a zero-length payload,
// so "no data" is one path and not two.
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

import { decodeDiagData } from "../compiler/diagnostics.ts";
import type { VLDiagnosticData } from "../compiler/diagnostics.ts";

type Exports = Record<string, (...args: number[]) => number>;

type Diag = { message: string; code: string; data: VLDiagnosticData; raw: string };

const instantiate = (): Exports => {
  const bytes = Deno.readFileSync(SEED);
  const module = new WebAssembly.Module(bytes);
  return new WebAssembly.Instance(module, {}).exports as unknown as Exports;
};

// STAGE 2c: the element is a UTF-8 byte, not a code point.
const readBytes = (len: number, at: (j: number) => number): Uint8Array => {
  const bytes = new Uint8Array(len);
  for (let j = 0; j < len; j++) bytes[j] = at(j);
  return bytes;
};
const readString = (len: number, at: (j: number) => number): string =>
  new TextDecoder().decode(readBytes(len, at));

/** One diagnostic's three channels: sentence, category code, decoded payload.
 *  `raw` is the payload's undecoded bytes, kept so a format change is visible in
 *  the failure message rather than only in a decoded field going missing. */
const diagAt = (exp: Exports, i: number): Diag => {
  const dataBytes = readBytes(exp.diagDataLen(i), (j) => exp.diagDataByte(i, j));
  return {
    message: readString(exp.diagMsgLen(i), (j) => exp.diagMsgAt(i, j)),
    code: readString(exp.diagCodeLen(i), (j) => exp.diagCodeByte(i, j)),
    data: decodeDiagData(dataBytes),
    raw: new TextDecoder().decode(dataBytes),
  };
};

/** Check `src` on a fresh store; return each diagnostic's three channels. */
const check = (
  exp: Exports,
  src: string,
): { rc: number; diags: Diag[] } => {
  exp.modReset();
  exp.srcReset();
  for (const ch of src) exp.srcPush(ch.codePointAt(0)!);
  const rc = exp.checkSrc();
  const diags: Diag[] = [];
  if (rc !== 0) {
    const n = exp.diagCount();
    for (let i = 0; i < n; i++) diags.push(diagAt(exp, i));
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

// ── D1230: the `ufcs-not-imported` PAYLOAD ───────────────────────────────────
// The other kind of code on this channel. `unsupported-lowering` is a CATEGORY —
// one word, and everything a consumer needs is in it. `ufcs-not-imported` also
// has to carry an ANSWER: which name, from which module(s), on what receiver, so
// an editor's quick-fix can write the import without parsing English.
//
// THE CODE STAYS A BARE CATEGORY AND THE ANSWER RIDES `data`, which is what this
// test is here to pin. The payload is a netstring sequence read as alternating
// key/value (`typecheck.diagDataField`); a repeated key is a list, so `modules`
// appears once per candidate and no field needs an in-band separator. Nothing in
// it is order-dependent and no value's characters can bite the framing — the
// round-trip test below is the witness, not the argument.
//
// Driving it needs a MODULE GRAPH, which `check` above cannot build: the whole
// point of the diagnostic is a name exported by another module. `checkGraph`
// serves the fetch loop from an in-memory map, so the fixture is self-contained
// and does not depend on anything under `std/`.

/** Fail unless `got` deep-equals `want` (both plain string→string[] records). */
const sameData = (got: VLDiagnosticData, want: VLDiagnosticData, where: string) => {
  const norm = (d: VLDiagnosticData) =>
    JSON.stringify(Object.keys(d).sort().map((k) => [k, d[k]]));
  if (norm(got) !== norm(want)) {
    throw new Error(
      `${where}: expected data ${JSON.stringify(want)}, got ${JSON.stringify(got)}`,
    );
  }
};

/** Check `entrySrc` on a fresh store with `mods` (key -> source) served to the
 *  module fetch loop; return each diagnostic's three channels. */
const checkGraph = (
  exp: Exports,
  entryKey: string,
  entrySrc: string,
  mods: Record<string, string>,
): { rc: number; diags: Diag[] } => {
  const push = (text: string, sink: (cp: number) => number) => {
    for (const ch of text) sink(ch.codePointAt(0)!);
  };
  exp.modReset();
  const commit = (key: string, source: string | undefined) => {
    push(key, exp.modKeyPush);
    if (source !== undefined) push(source, exp.modSrcPush);
    exp.modCommit(source !== undefined ? 1 : 0);
  };
  commit(entryKey, entrySrc);
  for (;;) {
    const n = exp.modPendingCount();
    if (n === 0) break;
    const keys: string[] = [];
    for (let i = 0; i < n; i++) {
      keys.push(readString(exp.modPendingLen(i), (j) => exp.modPendingAt(i, j)));
    }
    for (const key of keys) commit(key, mods[key]);
  }
  exp.srcReset();
  push(entrySrc, exp.srcPush);
  const rc = exp.checkSrc();
  const diags: Diag[] = [];
  if (rc !== 0) {
    const n = exp.diagCount();
    for (let i = 0; i < n; i++) diags.push(diagAt(exp, i));
  }
  return { rc, diags };
};

const LIB_SRC = [
  "export type Box = { v: i32 }",
  "export function box(v: i32): Box { return { v: v } }",
  "export function area(self: Box): i32 { return self.v * self.v }",
  "",
].join("\n");

Deno.test({
  name: "diag-code: an un-imported UFCS method carries `ufcs-not-imported` + payload",
  ignore,
}, () => {
  const exp = instantiate();
  const { rc, diags } = checkGraph(
    exp,
    "/w/entry.vl",
    'import { box } from "./lib"\nprint(box(5).area())\n',
    { "/w/lib.vl": LIB_SRC },
  );
  if (rc !== 2) throw new Error(`expected rc 2 (type stage), got ${rc}`);
  if (diags.length !== 1) {
    throw new Error(`expected 1 diagnostic, got: ${JSON.stringify(diags)}`);
  }
  // THE CODE IS A BARE CATEGORY. It used to be `ufcs-not-imported;member=area;…`
  // and a consumer had to cut at the first `;` to compare it; the payload has its
  // own channel now, so `===` is the whole comparison.
  if (diags[0].code !== "ufcs-not-imported") {
    throw new Error(
      `expected the bare category, got: ${JSON.stringify(diags[0])}`,
    );
  }
  sameData(
    diags[0].data,
    { member: ["area"], modules: ["./lib"], recv: ["Box"] },
    "one candidate module",
  );
  // The wire bytes, exactly — a netstring per field, key then value.
  const wantRaw = "6:member,4:area,7:modules,5:./lib,4:recv,3:Box,";
  if (diags[0].raw !== wantRaw) {
    throw new Error(
      `expected payload bytes ${JSON.stringify(wantRaw)}, got ${
        JSON.stringify(diags[0].raw)
      }`,
    );
  }
  // The MODULE SPECIFIER is the file's own import text, not the resolved key.
  // `/w/lib.vl` would be a path the author never typed and an import they cannot
  // write; `./lib` is the string already in the file.
  if (diags[0].raw.includes("/w/lib.vl")) {
    throw new Error(
      `the payload must carry the SPECIFIER, not the resolved key: ${
        JSON.stringify(diags[0])
      }`,
    );
  }
});

Deno.test({
  name: "diag-code: TWO candidate modules ride ONE diagnostic, one field each",
  ignore,
}, () => {
  const exp = instantiate();
  // Both modules export an `area(self: Box)`; the entry imports neither name.
  // A quick-fix offers one code action per listed module, so the candidates are
  // a FIELD of one diagnostic — two diagnostics would stack two squiggles on the
  // single `area` token.
  const { rc, diags } = checkGraph(
    exp,
    "/w/entry.vl",
    [
      'import { box } from "./lib"',
      'import { other } from "./more"',
      "print(box(5).area())",
      "print(other())",
      "",
    ].join("\n"),
    {
      "/w/lib.vl": LIB_SRC,
      "/w/more.vl": [
        'import { Box } from "./lib"',
        "export function area(self: Box): i32 { return self.v + self.v }",
        "export function other(): i32 { return 1 }",
        "",
      ].join("\n"),
    },
  );
  if (rc !== 2) throw new Error(`expected rc 2 (type stage), got ${rc}`);
  if (diags.length !== 1) {
    throw new Error(
      `expected exactly 1 diagnostic for 2 candidates, got: ${
        JSON.stringify(diags)
      }`,
    );
  }
  if (diags[0].code !== "ufcs-not-imported") {
    throw new Error(
      `expected the bare category, got: ${JSON.stringify(diags[0])}`,
    );
  }
  // ONE `modules` FIELD PER CANDIDATE, and that is how a list is spelled here —
  // there is no `,`-joined value to re-split, so a specifier holding a separator
  // cannot merge two modules into one or split one into two.
  sameData(
    diags[0].data,
    { member: ["area"], modules: ["./lib", "./more"], recv: ["Box"] },
    "two candidate modules",
  );
});

Deno.test({
  name: "diag-code: a member with no self-function anywhere keeps the plain sentence",
  ignore,
}, () => {
  const exp = instantiate();
  // THE CONTROL, and it runs in the SAME graph shape as the two above — the
  // registry is populated, and `nosuch` is simply not in it. A code here would
  // mean the enrichment fired on every unresolved member, which is the one way
  // this feature can be wrong without any fixture noticing.
  const { rc, diags } = checkGraph(
    exp,
    "/w/entry.vl",
    'import { box } from "./lib"\nprint(box(5).nosuch())\n',
    { "/w/lib.vl": LIB_SRC },
  );
  if (rc !== 2) throw new Error(`expected rc 2 (type stage), got ${rc}`);
  if (diags.length !== 1) {
    throw new Error(`expected 1 diagnostic, got: ${JSON.stringify(diags)}`);
  }
  if (diags[0].code !== "") {
    throw new Error(`expected an empty code, got: ${JSON.stringify(diags[0])}`);
  }
  sameData(diags[0].data, {}, "an uncoded diagnostic");
  if (!diags[0].message.includes("no field 'nosuch' on Box")) {
    throw new Error(
      `expected the plain member sentence, got: ${JSON.stringify(diags[0])}`,
    );
  }
});

// THE ROUND-TRIP, AND IT IS THE WHOLE REASON THE CHANNEL IS LENGTH-PREFIXED. The
// receiver renders as `{a: i32, tag: "a;b,c|d" | "éè"}` — every separator the old
// packed code used (`;` between fields, `,` between modules), the `=` and `"` and
// `|` besides, and two non-ASCII characters so a byte length and a JS `.length`
// disagree by two. A reader that split on any character, or that sliced a JS
// string by the wire length, gets a different answer than the compiler wrote.
Deno.test({
  name: "diag-code: a payload holding `;` `,` `|` `\"` and non-ASCII round-trips exactly",
  ignore,
}, () => {
  const exp = instantiate();
  const recv = '{a: i32, tag: "a;b,c|d" | "éè"}';
  const { rc, diags } = checkGraph(
    exp,
    "/w/entry.vl",
    'import { mk } from "./n"\nprint(mk().toEqual())\n',
    {
      "/w/n.vl": [
        `export function mk(): ${recv} { return { a: 1, tag: "éè" } }`,
        `export function toEqual(self: ${recv}): i32 { return 1 }`,
        "",
      ].join("\n"),
    },
  );
  if (rc !== 2) throw new Error(`expected rc 2 (type stage), got ${rc}`);
  if (diags.length !== 1) {
    throw new Error(`expected 1 diagnostic, got: ${JSON.stringify(diags)}`);
  }
  sameData(
    diags[0].data,
    { member: ["toEqual"], modules: ["./n"], recv: [recv] },
    "a receiver full of separators",
  );
  // The length is a UTF-8 BYTE count: 31 JS characters, 33 bytes.
  if (!diags[0].raw.includes(`33:${recv},`)) {
    throw new Error(
      `expected a 33-byte netstring for the receiver, got ${
        JSON.stringify(diags[0].raw)
      }`,
    );
  }
});

// ── the decoder itself, with no seed ─────────────────────────────────────────
// `decodeDiagData` is the reader every TS consumer uses, so its edge cases are
// pinned where the format is documented rather than in whichever consumer noticed
// first. NOT seed-gated: it is pure.

const enc = (t: string) => new TextEncoder().encode(t);

Deno.test("diag-data: an empty payload decodes to an empty record", () => {
  const got = decodeDiagData(new Uint8Array(0));
  if (Object.keys(got).length !== 0) {
    throw new Error(`expected {}, got ${JSON.stringify(got)}`);
  }
});

Deno.test("diag-data: a value may hold the framing characters", () => {
  // `3:,` is a field whose entire value is a comma; `1::` one that is a colon.
  const got = decodeDiagData(enc("1:a,3:x,y,1:b,1::,"));
  if (JSON.stringify(got) !== JSON.stringify({ a: ["x,y"], b: [":"] })) {
    throw new Error(`expected the literal values back, got ${JSON.stringify(got)}`);
  }
});

Deno.test("diag-data: a repeated key is a list, in wire order", () => {
  const got = decodeDiagData(enc("1:m,1:b,1:m,1:a,"));
  if (JSON.stringify(got) !== JSON.stringify({ m: ["b", "a"] })) {
    throw new Error(`expected wire order, got ${JSON.stringify(got)}`);
  }
});

// HALF AN ANSWER IS WORSE THAN NONE on a channel between two halves of one
// toolchain: a malformed payload means the seed and the reader disagree, and a
// quick-fix acting on the readable prefix would write an import from a module the
// compiler never named. Every one of these yields `{}`.
Deno.test("diag-data: a malformed payload decodes to nothing at all", () => {
  const bad = [
    "6:member",                 // no terminator
    "6:member,4:area",          // unterminated final field
    "6:member,4:area,4:recv,",  // odd field count — a key with no value
    ":x,",                      // empty length
    "x:1,",                     // non-digit length
    "9:short,",                 // length past the end
    "3:abcX",                   // wrong terminator
  ];
  for (const b of bad) {
    const got = decodeDiagData(enc(b));
    if (Object.keys(got).length !== 0) {
      throw new Error(`${JSON.stringify(b)} must decode to {}, got ${JSON.stringify(got)}`);
    }
  }
});
