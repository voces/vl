// The BULK SOURCE-INTAKE ABI (`docs/internals/perf-program.md` §6): the host may
// hand the compiler a whole string through the module's exported linear memory
// (`<name>Load(count)` over UTF-32LE at byte 0) instead of calling
// `<name>Push(cp)` once per code point. Staging the compiler's own module graph
// was 4,565,054 host calls; it is now 279.
//
// This suite exists because the mechanism is a CONTENT pipe with no natural
// oracle: a copy that drops, duplicates or reorders one code point produces a
// compiler that silently compiles the WRONG program. The self-compile catches
// that (22 of the compiler's 26 files span more than one chunk) — but only after
// a full ladder, and only for source shapes the compiler happens to contain. The
// assertions below are the fast, direct, shape-controlled version:
//
//   1. the ABI is PRESENT (a memory export + all four `*Load` functions) — the
//      memory only exists because `driver.srcLoad` calls `__load_i32__`, which is
//      an indirect enough dependency to be deleted by accident;
//   2. bulk-in == push-in, EXACTLY, for payloads chosen around the chunk seam
//      (`memory_size / 4` = 16,384 code points) and for non-ASCII;
//   3. the two paths agree on a real compile.
//
// Both sabotages recorded in §6.7 (drop the last code point of every chunk; drop
// one at a full-chunk seam only) fail assertion 2 immediately.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores,
// the same convention as the other seed-driven suites.
//
// Run with:  deno test -A tests/selfhost_native_bulk_intake_test.ts

// This repo's test files carry their own assert (no `@std/assert` in the import
// map) — same three lines as `lsp_docxref_test.ts`.
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
if (ignore) {
  console.warn(
    "[bulk-intake] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
  );
}

type Exports = Record<string, (...args: number[]) => number> & {
  memory?: WebAssembly.Memory;
  ioMem?: WebAssembly.Memory;
};

const moduleBytes = seedExists ? Deno.readFileSync(SEED) : new Uint8Array();
const compiled = seedExists ? new WebAssembly.Module(moduleBytes) : undefined;
const instantiate = (): Exports =>
  new WebAssembly.Instance(compiled!, {}).exports as unknown as Exports;

const stagingMemory = (exp: Exports): WebAssembly.Memory => {
  // The host's probe order (`StrIn::probe`): the ABI's private `ioMem` name
  // first, then the universal `memory` export every memory-using VL module gets
  // automatically (P0.2 / ruling O4(i)) — which is the one that actually arrives.
  const mem = exp.ioMem ?? exp.memory;
  if (!mem) throw new Error("no staging memory exported");
  return mem;
};

/** Push `s` one code point at a time — the original ABI, the oracle here. */
const pushString = (push: (c: number) => number, s: string) => {
  for (const ch of s) push(ch.codePointAt(0)!);
};

/** Send `s` through linear memory in `cap`-sized chunks — exactly what the Rust
 * host's `StrIn::send` does, so a divergence here is a divergence there. */
const loadString = (exp: Exports, load: (n: number) => number, s: string) => {
  const mem = stagingMemory(exp);
  const cap = (mem.buffer.byteLength / 4) | 0;
  const cps = Array.from(s, (c) => c.codePointAt(0)!);
  let off = 0;
  // An EMPTY string sends nothing at all — the loop must not fire once with 0,
  // and the push path likewise appends nothing. (The Rust side peeks first.)
  while (off < cps.length) {
    const n = Math.min(cap, cps.length - off);
    const view = new Int32Array(mem.buffer, 0, n);
    for (let i = 0; i < n; i++) view[i] = cps[off + i];
    load(n);
    off += n;
  }
};

const readString = (len: number, at: (j: number) => number): string => {
  const cps = new Array<number>(len);
  for (let j = 0; j < len; j++) cps[j] = at(j);
  return String.fromCodePoint(...cps);
};

/** Round-trip a payload through the MODULE-KEY channel and read it back out.
 * `modKeyAtLen`/`modKeyAtCharAt` are the only intake accumulator the driver
 * exposes verbatim, which makes the key channel the one testable pipe — and the
 * four loops are byte-identical in shape, so it stands for all of them. */
const roundTripKey = (payload: string, mode: "push" | "load"): string => {
  const exp = instantiate();
  exp.modReset();
  if (mode === "push") pushString((c) => exp.modKeyPush(c), payload);
  else loadString(exp, (n) => exp.modKeyLoad(n), payload);
  exp.modCommit(0); // found=0: register the key, no source, no scan
  return readString(exp.modKeyAtLen(0), (j) => exp.modKeyAtCharAt(0, j));
};

const CAP = (() => {
  if (!seedExists) return 16384;
  return (stagingMemory(instantiate()).buffer.byteLength / 4) | 0;
})();

Deno.test({
  name: "bulk intake: the ABI is exported (memory + all four Load channels)",
  ignore,
  fn: () => {
    const exp = instantiate();
    stagingMemory(exp); // throws if the memory section vanished
    for (
      const name of ["srcLoad", "modKeyLoad", "modSrcLoad", "cliResultLoad"]
    ) {
      assertEquals(
        typeof exp[name],
        "function",
        `${name} must be exported — without it the host silently falls back to ` +
          `one call per code point and this whole item is inert`,
      );
    }
  },
});

Deno.test({
  name: "bulk intake: the staging window is a whole 64 KiB page",
  ignore,
  fn: () => {
    // Not a performance assertion — a PROTOCOL one. The host derives its chunk
    // size from `memory.data_size() / 4`, so both sides must agree, and a memory
    // that came out 0 pages would make the host's `cap > 0` guard silently take
    // the fallback with no other symptom.
    assertEquals(stagingMemory(instantiate()).buffer.byteLength, 65536);
    assertEquals(CAP, 16384);
  },
});

Deno.test({
  name: "bulk intake: bulk == push, exactly, across the chunk seam",
  ignore,
  fn: () => {
    // `x` is arbitrary but position-sensitive: every code point differs from its
    // neighbours modulo 26, so a drop, a duplicate and a swap are all visible.
    const gen = (n: number) =>
      Array.from({ length: n }, (_, i) => String.fromCharCode(97 + (i % 26)))
        .join("");
    const sizes = [
      0, // empty — the host sends NOTHING, not one chunk of 0
      1,
      CAP - 1, // one short of a full chunk
      CAP, // exactly one full chunk (the seam sabotage's trigger)
      CAP + 1, // a full chunk plus a 1-code-point remainder
      CAP * 2, // two full chunks, no remainder
      CAP * 2 + 7,
    ];
    for (const n of sizes) {
      const payload = gen(n);
      assertEquals(
        roundTripKey(payload, "load").length,
        n,
        `length mismatch at ${n} code points`,
      );
      assertEquals(
        roundTripKey(payload, "load"),
        roundTripKey(payload, "push"),
        `bulk and per-code-point intake disagree at ${n} code points`,
      );
    }
  },
});

Deno.test({
  name: "bulk intake: non-ASCII and astral code points survive the round trip",
  ignore,
  fn: () => {
    // The pipe is UTF-32LE, so a BMP char and an astral one are one element
    // each. A host that wrote UTF-16 code UNITS would pass ASCII and fail here.
    const payload = "kÿ→漢字🙂/emoji🚀.vl";
    assertEquals(roundTripKey(payload, "load"), payload);
    assertEquals(roundTripKey(payload, "load"), roundTripKey(payload, "push"));
  },
});

Deno.test({
  name: "bulk intake: a program compiles identically through either path",
  ignore,
  fn: () => {
    // End-to-end: the emitted module must not depend on how the source arrived.
    const src = "function f(a: i32, b: i32) { a * b + 1 }\nprint(f(6, 7))\n";
    const compile = (mode: "push" | "load"): Uint8Array => {
      const exp = instantiate();
      exp.modReset();
      exp.srcReset();
      if (mode === "push") pushString((c) => exp.srcPush(c), src);
      else loadString(exp, (n) => exp.srcLoad(n), src);
      assertEquals(exp.compileSrc(), 0);
      const n = exp.rbyteLen();
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) out[i] = exp.rbyteAt(i);
      return out;
    };
    assertEquals(compile("load"), compile("push"));
  },
});
