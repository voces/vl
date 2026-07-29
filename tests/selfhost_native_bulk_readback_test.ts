// The BULK RESULT READ-BACK ABI (`docs/internals/perf-program.md` §7) — the OUT
// mirror of `selfhost_native_bulk_intake_test.ts`. The compiler may hand the host a
// whole result through the module's exported linear memory
// (`<name>Store(off, count)` at byte 0) instead of the host calling `<name>At(i)`
// once per element. Reading a self-compile's own module back was 1,112,716 host
// calls; it is now 17. `vl fmt compiler`'s output was 4,520,527; it is now 290.
//
// Two channels ship, and they are NOT the same shape:
//
//   `rbyteStore`       — BYTES, packed FOUR PER i32 WORD (little-endian), so a
//                        chunk is the whole 65,536-byte window and the host's copy
//                        is a slice, not a strided gather.
//   `cliCmdDataStore`  — CODE POINTS, one per word (UTF-32LE), so a chunk is
//                        `memory_size / 4` = 16,384 and astral characters are one
//                        element each.
//
// This suite exists for the same reason the intake one does: a bulk copy that
// drops, duplicates, reorders or mis-packs one element is a SILENTLY WRONG result
// with no natural oracle. For the byte channel the fixpoint ladder is a real
// witness (`scripts/refresh-compiler.sh` writes `vl build`'s read-back to disk and
// `cmp`s it), but it costs a full self-compile and it only says "the bytes
// differ". For the CODE-POINT channel there is no default witness at all:
// `vl fmt --check` never reads the payload out, so a corrupt `cliCmdDataStore`
// runs the corpus A/B to ZERO diffs over 1,712 files (§7.7 records the sabotage
// that proves it; its one accidental standing witness is a fmt SCALE test that
// happens to assert idempotence on a file bigger than a chunk). These assertions
// are the fast, direct, shape-controlled version:
//
//   1. the ABI is PRESENT (a memory export + both `*Store` functions);
//   2. the window is a whole 64 KiB page, so both sides derive the same chunk;
//   3. bulk-out == per-element-out EXACTLY over an (offset, count) matrix chosen
//      to straddle the chunk seam, the packing tail (count % 4) and the end of the
//      payload — on payloads deliberately longer than TWO chunks;
//   4. the guest CLAMPS at the end of the payload rather than reading past it;
//   5. astral code points survive the string channel as ONE element each.
//
// Loads the real seed (`build/vl-compiler.wasm`); absent, the suite self-ignores,
// the same convention as the other seed-driven suites.
//
// Run with:  deno test -A tests/selfhost_native_bulk_readback_test.ts

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
    "[bulk-readback] skipped — missing seed wasm. Build: bash scripts/refresh-compiler.sh",
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

/** The host's probe order (`io_mem` in `scripts/vl-host/src/main.rs`). */
const stagingMemory = (exp: Exports): WebAssembly.Memory => {
  const mem = exp.ioMem ?? exp.memory;
  if (!mem) throw new Error("no staging memory exported");
  return mem;
};

const loadString = (exp: Exports, load: (n: number) => number, s: string) => {
  const mem = stagingMemory(exp);
  const cap = (mem.buffer.byteLength / 4) | 0;
  const cps = Array.from(s, (c) => c.codePointAt(0)!);
  let off = 0;
  while (off < cps.length) {
    const n = Math.min(cap, cps.length - off);
    const view = new Int32Array(mem.buffer, 0, n);
    for (let i = 0; i < n; i++) view[i] = cps[off + i];
    load(n);
    off += n;
  }
};

const BYTE_CAP = seedExists
  ? stagingMemory(instantiate()).buffer.byteLength
  : 65536;
const CP_CAP = (BYTE_CAP / 4) | 0;

/** Offsets and counts that hit every boundary the two loops have: the start, the
 * packing tail (`count % 4` for the byte channel), a full chunk, one either side
 * of a full chunk, the second chunk seam, and the end of the payload. */
const matrix = (len: number, cap: number): Array<[number, number]> => {
  const offs = [0, 1, 2, 3, 4, cap - 1, cap, cap + 1, 2 * cap, len - 1, len];
  const counts = [0, 1, 2, 3, 4, 5, 7, 8, cap - 1, cap];
  const out: Array<[number, number]> = [];
  for (const o of offs) {
    if (o < 0 || o > len) continue;
    for (const c of counts) out.push([o, c]);
  }
  return out;
};

// ── the BYTE channel ──────────────────────────────────────────────────────────

/** Compile a source big enough that its emitted module spans more than two
 * chunks, and hand back the instance holding it. A long string literal is the
 * cheapest way there: ~3 emitted bytes per character, no per-function work. */
const bigEmit = (): Exports => {
  const exp = instantiate();
  exp.modReset();
  exp.srcReset();
  loadString(
    exp,
    (n) => exp.srcLoad(n),
    `export function s(): string { "${"abcdefghij".repeat(6000)}" }\n`,
  );
  assertEquals(exp.compileSrc(), 0, "the payload program must compile");
  return exp;
};

/** The oracle: one host call per byte. */
const bytesPerCall = (exp: Exports, off: number, n: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(exp.rbyteAt(off + i));
  return out;
};

/** The bulk path, byte-for-byte what `BytesOut::read` does in the Rust host. */
const bytesBulk = (
  exp: Exports,
  off: number,
  count: number,
): { written: number; bytes: number[] } => {
  const written = exp.rbyteStore(off, count);
  const mem = stagingMemory(exp);
  return {
    written,
    bytes: Array.from(new Uint8Array(mem.buffer, 0, Math.max(written, 0))),
  };
};

// ── the CODE-POINT channel ────────────────────────────────────────────────────

/** Drive the CLI pump to a `CMD_PRINT_OUT` whose payload is longer than two
 * chunks: `fmt` of a generated file, serviced entirely in memory. Returns the
 * instance parked on that command, so `cliCmdData*` reads the formatted text.
 *
 * The generated file is COMMENTS: the formatter preserves them verbatim, so the
 * output length is under the test's control and the payload carries astral
 * characters through a channel that must treat them as one element each. */
const bigPrint = (): Exports => {
  const exp = instantiate();
  const arg = (s: string) => {
    for (const ch of s) exp.cliArgPush(ch.codePointAt(0)!);
    exp.cliArgCommit();
  };
  exp.cliArgReset();
  arg("fmt");
  arg("generated.vl");
  arg("--color=never");
  let body = "";
  for (let i = 0; i < 3000; i++) {
    body += `// line ${String(i).padStart(6, "0")} 🚀漢字 ${"x".repeat(8)}\n`;
  }
  body += "function f(): i32 { 1 }\n";
  for (let guard = 0; guard < 64; guard++) {
    const cmd = exp.cliNext();
    if (cmd === 1) { // CMD_LIST_DIR — the target is a file, not a directory
      exp.cliDirCommit(0);
      continue;
    }
    if (cmd === 2) { // CMD_READ_FILE
      loadString(exp, (n) => exp.cliResultLoad(n), body);
      exp.cliFileCommit(1);
      continue;
    }
    if (cmd === 4) return exp; // CMD_PRINT_OUT — parked on the formatted text
    throw new Error(`the pump reached command ${cmd} without printing`);
  }
  throw new Error("the pump never reached CMD_PRINT_OUT");
};

const cpsPerCall = (exp: Exports, off: number, n: number): number[] => {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(exp.cliCmdDataAt(off + i));
  return out;
};

/** The bulk path, exactly what `StrOut::read` does in the Rust host. */
const cpsBulk = (
  exp: Exports,
  off: number,
  count: number,
): { written: number; cps: number[] } => {
  const written = exp.cliCmdDataStore(off, count);
  const mem = stagingMemory(exp);
  const view = new Int32Array(mem.buffer, 0, Math.max(written, 0));
  return { written, cps: Array.from(view) };
};

// ── the assertions ────────────────────────────────────────────────────────────

Deno.test({
  name: "bulk readback: the ABI is exported (memory + both Store channels)",
  ignore,
  fn: () => {
    const exp = instantiate();
    stagingMemory(exp); // throws if the memory section vanished
    for (const name of ["rbyteStore", "cliCmdDataStore"]) {
      assertEquals(
        typeof exp[name],
        "function",
        `${name} must be exported — without it the host silently falls back to ` +
          `one call per element and this whole item is inert`,
      );
    }
    // The un-bulked twin is deliberate, not an omission: `cliCmdPath` carries one
    // path, so it stays on the per-code-point accessor and keeps the host's
    // presence probe exercised on every `vl check`. If it ever grows a `Store`,
    // update `perf-program.md` §7 — do not just delete this line.
    assertEquals(typeof exp.cliCmdPathStore, "undefined");
  },
});

Deno.test({
  name: "bulk readback: the staging window is a whole 64 KiB page",
  ignore,
  fn: () => {
    // A PROTOCOL assertion, not a performance one: the host derives its byte
    // chunk from `memory.data_size()` and its code-point chunk from that over 4,
    // so a window that came out a different size would silently change both.
    assertEquals(BYTE_CAP, 65536);
    assertEquals(CP_CAP, 16384);
  },
});

Deno.test({
  name: "bulk readback: bytes — bulk == per-call across the chunk seam",
  ignore,
  fn: () => {
    const exp = bigEmit();
    const len = exp.rbyteLen();
    if (len <= 2 * BYTE_CAP) {
      throw new Error(
        `the payload program emitted ${len} bytes — under two chunks ` +
          `(${2 * BYTE_CAP}), so this test no longer reaches the seam`,
      );
    }
    for (const [off, count] of matrix(len, BYTE_CAP)) {
      const { written, bytes } = bytesBulk(exp, off, count);
      assertEquals(
        written,
        Math.min(count, len - off),
        `rbyteStore(${off}, ${count}) wrote the wrong count`,
      );
      assertEquals(
        bytes,
        bytesPerCall(exp, off, written),
        `rbyteStore(${off}, ${count}) content differs from rbyteAt`,
      );
    }
  },
});

Deno.test({
  name: "bulk readback: bytes — a whole module round-trips identically",
  ignore,
  fn: () => {
    // End-to-end, the host's own loop: chunk until the payload is consumed. The
    // emitted module must not depend on how it was read out.
    const exp = bigEmit();
    const len = exp.rbyteLen();
    const bulk: number[] = [];
    let off = 0;
    while (off < len) {
      const want = Math.min(len - off, BYTE_CAP);
      const { written, bytes } = bytesBulk(exp, off, want);
      if (written <= 0 || written > want) {
        throw new Error(`rbyteStore(${off}, ${want}) returned ${written}`);
      }
      for (const b of bytes) bulk.push(b);
      off += written;
    }
    assertEquals(bulk.length, len);
    assertEquals(bulk, bytesPerCall(exp, 0, len));
    // ...and the first bytes really are a wasm module, so a channel that returned
    // plausible-looking garbage is still caught.
    assertEquals(bulk.slice(0, 4), [0x00, 0x61, 0x73, 0x6d]);
  },
});

Deno.test({
  name: "bulk readback: code points — bulk == per-call across the chunk seam",
  ignore,
  fn: () => {
    const exp = bigPrint();
    const len = exp.cliCmdDataLen();
    if (len <= 2 * CP_CAP) {
      throw new Error(
        `the generated print payload is ${len} code points — under two chunks ` +
          `(${2 * CP_CAP}), so this test no longer reaches the seam`,
      );
    }
    for (const [off, count] of matrix(len, CP_CAP)) {
      const { written, cps } = cpsBulk(exp, off, count);
      assertEquals(
        written,
        Math.min(count, len - off),
        `cliCmdDataStore(${off}, ${count}) wrote the wrong count`,
      );
      assertEquals(
        cps,
        cpsPerCall(exp, off, written),
        `cliCmdDataStore(${off}, ${count}) content differs from cliCmdDataAt`,
      );
    }
  },
});

Deno.test({
  name: "bulk readback: code points — astral characters are ONE element each",
  ignore,
  fn: () => {
    // The pipe is UTF-32LE. A channel that wrote UTF-16 code UNITS would pass
    // every ASCII assertion above and desynchronise here.
    const exp = bigPrint();
    const len = exp.cliCmdDataLen();
    const whole: number[] = [];
    let off = 0;
    while (off < len) {
      const want = Math.min(len - off, CP_CAP);
      const { written, cps } = cpsBulk(exp, off, want);
      if (written <= 0 || written > want) {
        throw new Error(`cliCmdDataStore(${off}, ${want}) returned ${written}`);
      }
      for (const c of cps) whole.push(c);
      off += written;
    }
    assertEquals(whole, cpsPerCall(exp, 0, len));
    const text = String.fromCodePoint(...whole);
    assertEquals(
      text.includes("🚀漢字"),
      true,
      "the astral run did not survive",
    );
    // 3,000 rocket + 3,000 CJK code points, each ONE element of the channel.
    assertEquals(whole.filter((c) => c === 0x1f680).length, 3000);
  },
});

Deno.test({
  name: "bulk readback: the guest clamps at the end instead of over-reading",
  ignore,
  fn: () => {
    // The host never asks past the end, but the clamp is what makes "returned 0"
    // mean "nothing left" rather than "the accumulator moved" — and the host
    // FAILS on a 0 mid-payload, so the two halves have to agree exactly.
    const bytes = bigEmit();
    const blen = bytes.rbyteLen();
    assertEquals(bytes.rbyteStore(blen, 16), 0);
    assertEquals(bytes.rbyteStore(blen - 3, 16), 3);
    assertEquals(bytes.rbyteStore(blen + 99, 16), 0);
    const cps = bigPrint();
    const clen = cps.cliCmdDataLen();
    assertEquals(cps.cliCmdDataStore(clen, 16), 0);
    assertEquals(cps.cliCmdDataStore(clen - 3, 16), 3);
    assertEquals(cps.cliCmdDataStore(clen + 99, 16), 0);
  },
});
