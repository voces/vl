// THE HOST FLOOR AGREEMENT. The imports beneath `std:fs`, `std:args`, `std:process` and
// `std:env` are spelled by five sources, and each one can drift from the others:
//
//   - `HOST_FLOOR` in scripts/vl-host/src/main.rs: the native host's name, signature and
//     handler for each import;
//   - `fsIntrinsicNameAt` in compiler/check_intrinsics.vl: the slot order the emitter writes;
//   - the `declare(...)` rows in compiler/typecheck.vl: the types the checker gives them;
//   - the `blPush(...)` rows in compiler/driver.vl: the builtin list the editor shows;
//   - tests/support/runWasm.ts: the Deno harness's stubs.
//
// This file holds all five to one set of names, and the three that state a signature to
// one signature per name. It reads source text and runs nothing.

import { ROOT } from "./support/tree.ts";

const MAIN_RS = Deno.readTextFileSync(`${ROOT}/scripts/vl-host/src/main.rs`);
const TYPECHECK = Deno.readTextFileSync(`${ROOT}/compiler/typecheck.vl`);
const INTRINSICS = Deno.readTextFileSync(
  `${ROOT}/compiler/check_intrinsics.vl`,
);
const DRIVER = Deno.readTextFileSync(`${ROOT}/compiler/driver.vl`);
const RUN_WASM = Deno.readTextFileSync(`${ROOT}/tests/support/runWasm.ts`);

// A floor import's name, in every source.
const FLOOR_NAME = /^__(fs|args|proc|env)_[a-z_]*__$/;

function same(what: string, want: string[], got: string[]) {
  const w = [...want].sort().join(", ");
  const g = [...got].sort().join(", ");
  if (w !== g) throw new Error(`${what}\n  want: ${w}\n  got:  ${g}`);
}

// The text from `head` to the next line that is a lone `}` or `];` at column 0.
function block(src: string, head: string, what: string): string {
  const at = src.indexOf(head);
  if (at < 0) throw new Error(`${what}: \`${head}\` not found`);
  const rest = src.slice(at);
  const end = rest.search(/\n(}|];)\n/);
  if (end < 0) throw new Error(`${what}: no end after \`${head}\``);
  return rest.slice(0, end);
}

// `HOST_FLOOR`'s rows: name -> signature.
function hostRows(): Map<string, string> {
  const rows = new Map<string, string>();
  const body = block(MAIN_RS, "const HOST_FLOOR:", "main.rs");
  for (
    const m of body.matchAll(
      /\(\s*"([^"]+)",\s*"([^"]+)",\s*floor_[a-z_]+,?\s*\)/g,
    )
  ) {
    if (rows.has(m[1])) {
      throw new Error(`main.rs HOST_FLOOR: ${m[1]} listed twice`);
    }
    rows.set(m[1], m[2]);
  }
  return rows;
}

// `fsIntrinsicNameAt`'s names, in slot order, checked against `fsIntrinsicCount`.
function slotNames(): string[] {
  const body = block(
    INTRINSICS,
    "export function fsIntrinsicNameAt(",
    "check_intrinsics.vl",
  );
  const names: string[] = [];
  for (const m of body.matchAll(/if k == (\d+) \{ return "([^"]+)" \}/g)) {
    if (Number(m[1]) !== names.length) {
      throw new Error(
        `check_intrinsics.vl fsIntrinsicNameAt: want slot ${names.length}, got ${
          m[1]
        }`,
      );
    }
    names.push(m[2]);
  }
  const count = /export function fsIntrinsicCount\(\): i32 \{ (\d+) \}/.exec(
    INTRINSICS,
  );
  if (!count) {
    throw new Error("check_intrinsics.vl: `fsIntrinsicCount` not found");
  }
  if (Number(count[1]) !== names.length) {
    throw new Error(
      `check_intrinsics.vl: fsIntrinsicCount says ${
        count[1]
      }, fsIntrinsicNameAt names ${names.length}`,
    );
  }
  return names;
}

// The checker's `declare("<floor name>", mkFuncTy([...], R))` rows, as signatures.
function declaredRows(): Map<string, string> {
  const ty: Record<string, string> = {
    u8Arr: "u8[]",
    TY_I32: "i32",
    TY_I64: "i64",
    TY_NEVER: "void",
  };
  const spell = (t: string) => {
    const s = ty[t.trim()];
    if (s === undefined) {
      throw new Error(`typecheck.vl: no spelling for \`${t.trim()}\``);
    }
    return s;
  };
  const rows = new Map<string, string>();
  const re =
    /declare\(\s*"([^"]+)",\s*mkFuncTy\(\s*(noParams|\[([^\]]*)\]),\s*(\w+)\s*\),?\s*\)/g;
  for (const m of TYPECHECK.matchAll(re)) {
    if (!FLOOR_NAME.test(m[1])) continue;
    const params = m[2] === "noParams" ? [] : m[3].split(",").map(spell);
    rows.set(m[1], `(${params.join(", ")}) => ${spell(m[4])}`);
  }
  return rows;
}

// The builtin list's floor rows: name -> signature.
function builtinRows(): Map<string, string> {
  const rows = new Map<string, string>();
  for (const m of DRIVER.matchAll(/blPush\("([^"]+)", \d+, "([^"]+)"\)/g)) {
    if (FLOOR_NAME.test(m[1])) rows.set(m[1], m[2]);
  }
  return rows;
}

// The Deno harness's floor names: the stub list and the one it implements.
function harnessNames(): string[] {
  return [
    ...new Set(
      [...RUN_WASM.matchAll(/"(__[a-z_]+__)"|\b(__proc_exit__):/g)]
        .map((m) => m[1] ?? m[2])
        .filter((n) => FLOOR_NAME.test(n)),
    ),
  ];
}

function bySignature(
  what: string,
  want: Map<string, string>,
  got: Map<string, string>,
) {
  const bad: string[] = [];
  for (const [name, sig] of want) {
    if (got.get(name) !== sig) {
      bad.push(`${name}: want ${sig}, got ${got.get(name)}`);
    }
  }
  if (bad.length > 0) throw new Error(`${what}\n  ${bad.join("\n  ")}`);
}

Deno.test("host floor: every source names the same imports", () => {
  const slots = slotNames();
  if (slots.length < 10) {
    throw new Error(`parsed too little: want >=10 slots, got ${slots.length}`);
  }
  same("main.rs HOST_FLOOR against fsIntrinsicNameAt", slots, [
    ...hostRows().keys(),
  ]);
  same("typecheck.vl declare rows against fsIntrinsicNameAt", slots, [
    ...declaredRows().keys(),
  ]);
  same("driver.vl blPush rows against fsIntrinsicNameAt", slots, [
    ...builtinRows().keys(),
  ]);
  same(
    "tests/support/runWasm.ts against fsIntrinsicNameAt",
    slots,
    harnessNames(),
  );
});

Deno.test("host floor: the host, the checker and the builtin list state one signature", () => {
  const host = hostRows();
  bySignature(
    "typecheck.vl declare rows against main.rs HOST_FLOOR",
    host,
    declaredRows(),
  );
  bySignature(
    "driver.vl blPush rows against main.rs HOST_FLOOR",
    host,
    builtinRows(),
  );
});
