// kill-TS: member completion off the SELF-HOSTED checker. `memberCompletionsAt`
// resolves the receiver binding under the cursor (the host strips the trailing
// `.` so it parses as a bare expression — the native parser isn't error-tolerant
// for `receiver.`) and enumerates its members: a struct's fields, or a `string`'s
// builtin methods. The native counterpart of `receiverObjectType` +
// `memberCompletions`. Seed-gated (loads the real `build/vl-compiler.wasm`); when
// absent (fresh clone) the seed-backed cases self-ignore, like the rest of the
// wasm suite. The pure `memberCompletionsFromWasm` conversion runs unconditionally.
//   deno test -A --no-check tests/lsp_member_completion_wasm_test.ts

import { loadWasmChecker } from "../lsp/src/wasmChecker.ts";
import { memberCompletionsFromWasm } from "../lsp/src/typeFeatures.ts";

const assertEquals = <T>(actual: T, expected: T, msg?: string): void => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ? msg + ": " : ""}expected ${e}, got ${a}`);
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

// The names of the members the wasm checker resolves for the receiver at
// (line, col) in `repairedSrc` (the `.`-stripped form the server passes).
const memberNames = async (
  repairedSrc: string,
  line: number,
  col: number,
): Promise<string[]> => {
  const checker = loadWasmChecker(SEED, () => {})!;
  const members = await checker.memberCompletionsAt(
    repairedSrc,
    "/tmp/x.vl",
    noSiblings,
    line,
    col,
  );
  return members.map((m) => m.name);
};

Deno.test({
  name: "wasm-member-completion: a struct receiver's fields",
  ignore,
}, async () => {
  // Repaired (dot stripped) source: `p` is a bare expression on line 2 (0-based 1).
  const names = await memberNames("let p = { x: 1, y: 2 }\np\nprint(1)\n", 1, 0);
  assertEquals(names.sort(), ["x", "y"], "struct fields");
});

Deno.test({
  name: "wasm-member-completion: kinds + detail (field vs method)",
  ignore,
}, async () => {
  const checker = loadWasmChecker(SEED, () => {})!;
  // A plain struct field → not a method, detail is its type.
  const fields = await checker.memberCompletionsAt(
    "let p = { x: 1, y: 2 }\np\nprint(1)\n",
    "/tmp/x.vl",
    noSiblings,
    1,
    0,
  );
  const x = fields.find((m) => m.name === "x");
  if (x === undefined) throw new Error("expected an `x` field");
  assertEquals(x.isMethod, false, "a plain field is not a method");
  assertEquals(x.detail, "i32", "field detail is its type");
  // A builtin string method → a method, with its rendered signature as detail.
  const methods = await checker.memberCompletionsAt(
    'let s = "hi"\ns\nprint(1)\n',
    "/tmp/x.vl",
    noSiblings,
    1,
    0,
  );
  const slice = methods.find((m) => m.name === "slice");
  if (slice === undefined) throw new Error("expected a `slice` method");
  assertEquals(slice.isMethod, true, "a builtin method is a method");
  assertEquals(slice.detail, "(i32, i32) -> string", "method detail is its signature");
});

Deno.test({
  name: "wasm-member-completion: a string receiver's builtin methods",
  ignore,
}, async () => {
  const names = await memberNames('let s = "hi"\ns\nprint(1)\n', 1, 0);
  assertEquals(
    names.sort(),
    ["charCodeAt", "includes", "indexOf", "slice"],
    "string builtin methods",
  );
});

Deno.test({
  name: "wasm-member-completion: an array receiver offers no members (TS parity)",
  ignore,
}, async () => {
  const names = await memberNames("let xs = [1, 2]\nxs\nprint(1)\n", 1, 0);
  assertEquals(names, [], "arrays expose no member completions, like the TS path");
});

Deno.test({
  name: "wasm-member-completion: cursor off any binding yields nothing",
  ignore,
}, async () => {
  const names = await memberNames("let p = { x: 1 }\np\nprint(1)\n", 2, 0);
  assertEquals(names, [], "a non-receiver position resolves no members");
});

// ---- the pure host conversion (no seed needed) ------------------------------

Deno.test("memberCompletionsFromWasm: maps method/field kinds and drops empty detail", () => {
  const out = memberCompletionsFromWasm([
    { name: "x", detail: "i32", isMethod: false },
    { name: "dist", detail: "() -> f64", isMethod: true },
    { name: "bare", detail: "", isMethod: false },
    { name: "x", detail: "dup", isMethod: false }, // de-dup: first wins
  ]);
  assertEquals(out.length, 3, "duplicate name dropped");
  assertEquals(out[0], { name: "x", kind: "variable", detail: "i32" });
  assertEquals(out[1], { name: "dist", kind: "function", detail: "() -> f64" });
  assertEquals(out[2], { name: "bare", kind: "variable", detail: undefined });
});
