// The editor must never present a type name VL does not have.
//
// Owner report: writing
//
//   function foobar(v: {foo: string} | {bar: any}) {
//     if v is { foo: string } { return v.foo }
//     return v.bar
//   }
//
// in the playground, the inferred return type rendered as `any | any`.
//
// Every rendered type the editor shows comes from ONE native producer, `tyToStr`
// (compiler/typecheck.vl), whose own header calls it "type → string (for
// diagnostics)". It emits two tokens VL cannot spell:
//   `_`       — NO TYPE WAS DETERMINED HERE: a `?fn.N` inference hole (an
//               un-annotated, still-polymorphic param) and, in the same token, an
//               absent arena entry (the element of an empty `[]`, the key/value of
//               an empty `Map()`, the inner of a lone `null`)
//   `<error>` — `TyErr`, e.g. an annotation that did not resolve
// plus `<?>` (an unhandled arm).
//
// The hole is spelled `_` and not `any` BECAUSE OF this file's own report: the owner
// read a rendered type off the playground and then wrote it as an annotation. A
// bareword invites that; a blank does not.
//
// These need OPPOSITE treatments, and the split is the point of this file:
//
//   * `<error>`/`<?>` say a type is ABSENT. An editor surface may not
//     show them — an inlay hint is formatted `: T` (a suggestion of the
//     annotation to write) and a hover is fenced as `vital` (a claim the text is
//     VL). They are filtered by `isDisplayableType`.
//   * `_` says a type is UNKNOWN but its surrounding SHAPE is not. It appears on healthy,
//     diagnostic-free code that VL deliberately supports (see
//     `tests/cases/inference/hole-is-guard-return-join.vl`, PRs #1073/#1076), so
//     it is NOT filtered here — collapsing `_ | _` to `_` would still print
//     a non-VL name, and the two holes are DISTINCT types (`?f.0`/`?f.1`) whose
//     distinctness `tyToStr` has already destroyed. That half is a producer fix,
//     filed against `typecheck.vl`; the host cannot do it correctly.
//     UPDATE — that producer fix has landed. `inlayHole` (typecheck.vl) now reads
//     a union as a DATA STRUCTURE: a union whose members are ALL holes is itself a
//     hole and is never offered as a hint, matching the answer the BARE hole always
//     got. The host filter below is UNCHANGED and still does not suppress `_` —
//     a hole-BEARING type that carries real structure (`{foo: string} | {bar: _}`,
//     `_ | string`) is still shown, because deleting an informative hint from
//     correct code is the failure mode this file exists to prevent.
//   * `…` (the depth cap) says a type is PRESENT but ELIDED — measured firing 45
//     times on CLEAN corpus files (deep recursive types). Suppressing on it would
//     delete informative hints from correct programs, so it is excluded.
//
// Run with:
//   deno test -A --no-check tests/lsp_undisplayable_type_test.ts
// (also included in `deno task test`).

import {
  displayableType,
  inlayHintsFromWasm,
  isDisplayableType,
  scopeCompletionsFromBindings,
} from "../lsp/src/typeFeatures.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
  }
};

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
const noSiblings = () => undefined;

// ---- the pure predicate ----------------------------------------------------
// No seed needed: the absence/presence split stated as a table.

Deno.test("displayable-type: absence markers are filtered, elision is not", () => {
  // ABSENT — never displayable. The angle brackets are the whole vocabulary: they
  // are the shape no writable VL type rendering wears, which is what lets this stay
  // a substring test.
  for (const s of ["<error>", "<?>", "(<error>) => string", "<error> | null"]) {
    assertEquals(isDisplayableType(s), false, `absent marker ${s}`);
  }
  // Empty is not a type either.
  assertEquals(isDisplayableType(""), false, "empty");
  // PRESENT — displayable, including the elided and the blank-bearing renderings.
  // The blank rows are the producer's ONE token for "no type was determined here",
  // whatever produced it: an un-annotated param, an empty `[]`'s element, an empty
  // `Map()`'s key/value, a lone `null`'s inner. Each still names the SHAPE around
  // the blank, which is the information an editor surface exists to carry — and a
  // bare `_` could not be listed above in any case, being a substring of ordinary
  // identifiers (`{foo_bar: i32}`).
  for (
    const s of [
      "i32",
      "string | i32",
      "{head: i32, tail: {head: …, tail: …}[]}", // depth cap: a REAL type, elided
      "_ | _", // an inference hole: present + polymorphic, not our business
      "(_) => _",
      "_[]", // an empty literal's element
      "{[_]: _}", // an empty `Map()`
      "_ | null", // a lone `null`
      "{foo_bar: i32}", // a real type whose NAME contains the blank's character
    ]
  ) {
    assertEquals(isDisplayableType(s), true, `present ${s}`);
  }
  // The hover-chain filter maps undisplayable → undefined so the caller falls through.
  assertEquals(displayableType("(<error>) => string"), undefined, "chain drops");
  assertEquals(displayableType("i32"), "i32", "chain keeps");
  assertEquals(displayableType(undefined), undefined, "chain passes undefined");
});

// ---- the owner's program, end to end ---------------------------------------

const inlayLabels = async (
  checker: NonNullable<ReturnType<typeof loadWasmChecker>>,
  src: string,
): Promise<string[]> => {
  const cands = await checker.inlayHintsAt(src, "/tmp/x.vl", noSiblings);
  return inlayHintsFromWasm(cands, undefined, src).map((h) => h.label);
};

// Hover over the function NAME (line 0), which is where a return-type hover lands.
const hoverAtFnName = async (
  checker: NonNullable<ReturnType<typeof loadWasmChecker>>,
  src: string,
): Promise<string | undefined> =>
  displayableType(
    await checker.hoverTypeAt(src, "/tmp/x.vl", noSiblings, 0, 10).catch(() =>
      undefined
    ),
  );

Deno.test({
  name: "undisplayable: the owner's exact program shows no non-VL type name",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const src = `function foobar(v: {foo: string} | {bar: any}) {
  if v is { foo: string } { return v.foo }
  return v.bar
}
print(foobar({ bar: "okie" }))
`;
  // The annotation does not resolve (`any` is not a VL type), so the checker
  // types the parameter `TyErr`. Hover used to read `(<error>) => string`; it is
  // now suppressed rather than printing a type VL does not have.
  assertEquals(await hoverAtFnName(checker, src), undefined, "hover suppressed");

  // Whatever labels DO survive must be spellable — no `<error>`/`<?>`.
  for (const label of await inlayLabels(checker, src)) {
    assertEquals(isDisplayableType(label.slice(2)), true, `inlay label ${label}`);
  }

  // The defect is diagnosed to the user by the checker, not by a bogus type.
  // The message names the OFFENDING COMPONENT (`'any' within '{foo:string}|{bar:any}'`)
  // rather than the whole composite — the checker-side half of this same report, landed
  // in the queued-defects slice; the two halves were found independently and agree.
  const diags = await checker.check(src, "/tmp/x.vl", noSiblings);
  assertEquals(
    diags.map((d) => d.message),
    ["unknown type 'any' within '{foo:string}|{bar:any}'"],
    "the annotation is reported",
  );
});

// The three nesting shapes from the report, ONE VARIABLE APART: same body, only
// the parameter annotation changes. All three fail to resolve, so all three must
// show no non-VL type name — and (refuting the report's reading) all three keep
// BOTH diagnostics. The lost second diagnostic in the owner's program is caused
// by the `is` GUARD, not by the annotation nesting — see the next test.
Deno.test({
  name: "undisplayable: the three nesting shapes leak no non-VL type name",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const body = `{
  if true { return v.foo }
  return v.bar
}
print(1)
`;
  const shapes: [string, string][] = [
    ["v: any", `function f(v: any) ${body}`],
    ["v: {bar: any}", `function f(v: {bar: any}) ${body}`],
    ["v: {foo: string} | {bar: any}", `function f(v: {foo: string} | {bar: any}) ${body}`],
  ];
  for (const [name, src] of shapes) {
    assertEquals(await hoverAtFnName(checker, src), undefined, `hover ${name}`);
    for (const label of await inlayLabels(checker, src)) {
      assertEquals(isDisplayableType(label.slice(2)), true, `${name} label ${label}`);
    }
    // Both diagnostics survive at every nesting depth.
    const diags = await checker.check(src, "/tmp/x.vl", noSiblings);
    assertEquals(diags.length, 2, `${name} keeps both diagnostics`);
  }
});

// The variable that actually drops the second diagnostic: the `is` guard, held
// against an IDENTICAL annotation. Not a fix — a pin on the real cause, so the
// filed producer-side diff is measured against the right thing.
Deno.test({
  name: "undisplayable: the `is` guard, not nesting, drops the second diagnostic",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const ann = "function f(v: {foo: string} | {bar: any})";
  const msgs = async (src: string) =>
    (await checker.check(src, "/tmp/x.vl", noSiblings)).map((d) => d.message);

  assertEquals(
    await msgs(`${ann} {\n  if true { return v.foo }\n  return v.bar\n}\nprint(1)\n`),
    [
      "unknown type 'any' within '{foo:string}|{bar:any}'",
      "cannot infer a return type for 'f' — annotate a return type",
    ],
    "plain `if`: both diagnostics",
  );
  assertEquals(
    await msgs(
      `${ann} {\n  if v is { foo: string } { return v.foo }\n  return v.bar\n}\nprint(1)\n`,
    ),
    ["unknown type 'any' within '{foo:string}|{bar:any}'"],
    "`is` guard: the second diagnostic is lost",
  );
});

// ---- CONTROLS: these must keep working -------------------------------------
// One variable changes per control; each asserts a hint that must NOT vanish.

Deno.test({
  name: "control: healthy code keeps its hints (resolvable union, T|T, all-annotated)",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;

  // A genuinely resolvable union return still renders, unchanged.
  const unionSrc = `function f(b: boolean) {\n  if b { return "s" }\n  return 1\n}\nprint(1)\n`;
  assertEquals(
    await inlayLabels(checker, unionSrc),
    [": string | i32"],
    "resolvable union return survives",
  );
  assertEquals(
    await hoverAtFnName(checker, unionSrc),
    "(boolean) => string | i32",
    "resolvable union hover survives",
  );

  // A genuinely duplicated union collapses in the CHECKER (not the display) and
  // still compiles — `T | T` dedup is not the defect.
  const dupSrc =
    `function f(b: boolean) {\n  if b { return "a" }\n  return "b"\n}\nprint(f(true))\n`;
  assertEquals(await inlayLabels(checker, dupSrc), [": string"], "T|T collapses");
  assertEquals(
    (await checker.check(dupSrc, "/tmp/x.vl", noSiblings)).length,
    0,
    "T|T is clean",
  );

  // A function whose parameters all resolve: the return hint survives, and the
  // annotated params produce none (the pre-existing rule).
  const addSrc = `function add(a: i32, b: i32) {\n  return a + b\n}\nprint(add(1,2))\n`;
  assertEquals(await inlayLabels(checker, addSrc), [": i32"], "all-resolving params");
  assertEquals(
    await hoverAtFnName(checker, addSrc),
    "(i32, i32) => i32",
    "all-resolving hover",
  );
});

// The hole-marker half is the PRODUCER's, and the producer fix this file filed against
// `typecheck.vl` (see the header) has now landed: `inlayHole` reads a union as a
// DATA STRUCTURE instead of stopping at its top constructor, so a union whose
// members are ALL holes is a hole and offers no hint — the same answer the BARE
// hole already got. The defect was the inconsistency, `: _` hidden while
// `: _ | _` was shown for the same unresolved thing.
//
// The host filter is unchanged and still does NOT suppress `_`: that is
// deliberate, and the two assertions below are what keeps the fix honest — a
// hole-bearing type that carries REAL structure must still be offered.
// Measured over the 1,345-file corpus: candidate hints 8,504 → 8,468, and the
// 36 that went are exactly `_ | _` (35) and `_ | _ | _` (1). No hint
// was added and no surviving hint changed.
Deno.test({
  name: "control: an all-hole union offers no hint, but a hole-BEARING type still does",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  // The owner's function WITHOUT the annotation — a supported VL idiom that runs
  // (`tests/cases/inference/hole-is-guard-return-join.vl`).
  const src =
    `function foobar(v) {\n  if v is { foo: string } then return v.foo\n  return v.bar\n}\nprint(foobar({ bar: 42 }))\n`;
  assertEquals(
    (await checker.check(src, "/tmp/x.vl", noSiblings)).length,
    0,
    "the un-annotated idiom is clean code",
  );
  const labels = await inlayLabels(checker, src);
  // The all-hole return union is no longer offered...
  if (labels.includes(": _ | _")) {
    throw new Error(
      `the all-hole union should offer no hint; got ${JSON.stringify(labels)}`,
    );
  }
  // ...while the parameter's hole-BEARING but structured type still is. This is
  // the half that must never regress: suppressing it would delete an informative
  // hint from correct code.
  if (!labels.includes(": {foo: string} | {bar: _}")) {
    throw new Error(
      `expected the structured hole-bearing hint to survive; got ${
        JSON.stringify(labels)
      }`,
    );
  }

  // A MIXED hole union — one hole member, one resolved member — is NOT an
  // all-hole union and keeps its hint. The ALL-members test is the whole
  // difference between this fix and deleting every `_`.
  const mixed =
    `function describe<T>(x: T) {\n  if x is i32 { return "num" }\n  return "str"\n}\nprint(describe(5))\nprint(describe("hi"))\n`;
  assertEquals(
    (await checker.check(mixed, "/tmp/x.vl", noSiblings)).length,
    0,
    "the mixed-union idiom is clean code",
  );
  const mixedLabels = await inlayLabels(checker, mixed);
  if (!mixedLabels.includes(": _ | string")) {
    throw new Error(
      `expected the mixed hole union to survive; got ${
        JSON.stringify(mixedLabels)
      }`,
    );
  }
});

// A hint must not vanish on healthy code. Sweep the whole corpus: assert the
// filter removes hints ONLY on files that carry an error-tier diagnostic, with
// the one measured exception below.
Deno.test({
  name: "control: the filter removes no hint from a diagnostic-free file (corpus sweep)",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const root = new URL("./cases/", import.meta.url).pathname;

  // NO EXCEPTIONS, and the empty set is the assertion. The filter drops a hint only
  // on a file that carries an error diagnostic; a diagnostic-free file keeps every
  // hint it has. The two files that used to sit here — `types/infer-null-
  // unconstrained.vl` (`let _x = null`) and `arrays/lambda-empty-array-literal-
  // return.vl` (`const fu = () => { return [] }`) — are clean programs whose
  // inferred types have an UNDETERMINED component, and the producer now renders that
  // component as the blank `_` (`: _ | null`, `: () => _[]`) instead of an
  // angle-bracket absence token. A blank-bearing rendering still names the shape
  // around the blank, so it is displayable and the hints survive, which is why this
  // list is empty rather than why the filter got weaker. Keep it empty: a name
  // appearing here again means a producer started emitting an absence token on
  // correct code, and that is the defect, not the exception.
  const KNOWN_CLEAN_DROPS = new Set<string>([]);

  const files: string[] = [];
  for await (const dir of Deno.readDir(root)) {
    if (!dir.isDirectory) continue;
    for await (const f of Deno.readDir(`${root}${dir.name}`)) {
      if (f.isFile && f.name.endsWith(".vl")) files.push(`${dir.name}/${f.name}`);
    }
  }
  files.sort();
  if (files.length < 1000) {
    throw new Error(`corpus sweep found only ${files.length} files — harness bug`);
  }

  const unexpected: string[] = [];
  let scanned = 0, dropsOnClean = 0, dropsOnErrored = 0;
  for (const rel of files) {
    const src = await Deno.readTextFile(`${root}${rel}`);
    let cands, diags;
    try {
      cands = await checker.inlayHintsAt(src, `${root}${rel}`, noSiblings);
      diags = await checker.check(src, `${root}${rel}`, noSiblings);
    } catch {
      continue;
    }
    scanned++;
    // How many candidates the displayable filter removes, independent of the
    // annotation/range filters that were always there.
    const dropped = cands.filter((c) => !isDisplayableType(c.type)).length;
    if (dropped === 0) continue;
    if (diags.some((d) => d.severity === "error")) dropsOnErrored += dropped;
    else {
      dropsOnClean += dropped;
      if (!KNOWN_CLEAN_DROPS.has(rel)) unexpected.push(`${rel} (${dropped})`);
    }
  }

  if (scanned < 1000) {
    throw new Error(`only ${scanned} files checked out — harness bug`);
  }
  assertEquals(unexpected, [], "hints removed from diagnostic-free files");
  assertEquals(dropsOnClean, KNOWN_CLEAN_DROPS.size, "exactly the known clean drops");
  // With the clean side at zero, the ERRORED side is what keeps this sweep from
  // passing vacuously: a harness that silently stops producing candidates, or a
  // filter that stops filtering, fails here instead of reporting a clean zero.
  if (dropsOnErrored < 1) {
    throw new Error("the filter dropped nothing on any errored file — harness bug");
  }
});

// The completion detail reads the same `tyToStr` output as hover and the inlay
// label, so it takes the same filter — a binding whose type didn't resolve offers
// a completion with NO detail rather than one detailed `<error>`.
Deno.test({
  name: "undisplayable: completion detail drops an unresolved type",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const src = `function f(v: any) {\n  return v.foo\n}\nprint(1)\n`;
  const binds = await checker.scopeAt(src, "/tmp/x.vl", noSiblings, 3, 0);
  // The binding IS offered (completion still works) but carries no bogus detail.
  const fEntry = scopeCompletionsFromBindings(binds).find((c) => c.name === "f");
  if (fEntry === undefined) {
    throw new Error(`expected an 'f' completion; got ${JSON.stringify(binds)}`);
  }
  assertEquals(fEntry.detail, undefined, "no `<error>` detail");
  // Control: a resolving function DOES carry its detail.
  const okSrc = `function g(a: i32) {\n  return a\n}\nprint(1)\n`;
  const okBinds = await checker.scopeAt(okSrc, "/tmp/x.vl", noSiblings, 3, 0);
  const gEntry = scopeCompletionsFromBindings(okBinds).find((c) => c.name === "g");
  assertEquals(gEntry?.detail, "(i32) => i32", "healthy detail survives");
});
