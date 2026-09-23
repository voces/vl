// `std:fs` WRITES FROM LINEAR MEMORY, AT AN OFFSET AND AT THE END — the native `vl` binary
// over the shipping `std/fs.vl`.
//
// The corpus pins the edge matrix (`tests/cases/std/fs-write.vl`) against an eight-byte
// buffer, because a fixture has to be hermetic and cheap. Eight bytes cannot show what
// these exports exist for: that a `Buf` reaches the file with no second copy of it on the
// heap, that a file can be streamed out in windows of one buffer, and that an offset past
// 4 GiB addresses the file rather than wrapping. So this suite writes 64 MiB, checks it
// byte for byte, prices it against the whole-array `writeFile`, and deletes it.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native` auto-discovers
// (tests/ci_seed_coverage_test.ts).
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm,
// so it self-ignores on a fresh clone and runs in `ci-native`.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";
import { runWasm } from "./support/runWasm.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-std-fs-write] skipped — missing vl binary or seed wasm.");
}

const MIB = 1024 * 1024;
const SIZE = 64 * MIB;
const WIN = MIB;
// Byte `i` holds `i % 251`: a prime stride, so a window written at the wrong offset changes
// bytes at every position rather than repeating the same ones shifted.
const PATTERN = (i: number): number => i % 251;

const dec = new TextDecoder();

/** Build `src` to a wasm file with the native `vl`, with the tree's own std pinned. */
const build = async (dir: string, name: string, src: string): Promise<string> => {
  const entry = `${dir}/${name}.vl`;
  const out = `${entry}.wasm`;
  await Deno.writeTextFile(entry, src);
  const built = await new Deno.Command(VL, {
    args: ["build", entry, "--compiler", COMPILER, "-o", out],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  if (built.code !== 0) {
    throw new Error(`\`vl build\` ${name} exited ${built.code}\n${dec.decode(built.stderr)}`);
  }
  return out;
};

/** Run a built module; with `/usr/bin/time` present, also answer its peak RSS in KiB. */
const runBuilt = async (
  wasm: string,
): Promise<{ out: string; secs: number; rssKiB: number }> => {
  const timed = exists("/usr/bin/time");
  const cmd = timed ? "/usr/bin/time" : VL;
  const args = timed ? ["-f", "RSSKIB %M", VL, "run", wasm] : ["run", wasm];
  const t0 = performance.now();
  const { code, stdout, stderr } = await new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  const secs = (performance.now() - t0) / 1000;
  const out = dec.decode(stdout).trimEnd();
  const err = dec.decode(stderr);
  if (code !== 0) throw new Error(`\`vl run\` exited ${code}\nstdout:\n${out}\nstderr:\n${err}`);
  const m = err.match(/RSSKIB (\d+)/);
  return { out, secs, rssKiB: m ? Number(m[1]) : -1 };
};

const run = async (dir: string, name: string, src: string): Promise<string> =>
  (await runBuilt(await build(dir, name, src))).out;

const check = (got: string, want: string, what: string) => {
  if (got !== want) throw new Error(`${what}\nwant:\n${want}\ngot:\n${got}`);
};

const sha256 = async (bytes: Uint8Array): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

// The 64 MiB `Buf` every streaming program fills before it writes, so the programs differ
// only in how the bytes leave.
const FILL = `const N = ${SIZE}
const WIN = ${WIN}
const b = Buffer(N)
let i = 0
while i < N {
  store8(b, i, i % 251)
  i = i + 1
}
`;

Deno.test({
  // The shape a consumer writes: one buffer, streamed out a window at a time, with the file
  // started fresh by `writeFile(path, [])`. Checked by size and SHA-256 against the pattern,
  // and priced against the whole-array `writeFile` it replaces: peak RSS must show that no
  // second copy of the 64 MiB was made on the way to the file.
  name: "std:fs: 64 MiB streamed from one Buf in 1 MiB windows, with no second copy",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fs_write_stream_" });
    const path = `${dir}/out.bin`;
    try {
      const want = new Uint8Array(SIZE);
      for (let i = 0; i < SIZE; i++) want[i] = PATTERN(i);
      const wantSha = await sha256(want);
      const progs: Record<string, string> = {
        fill_only: `import { Buffer, store8 } from "std:buffer"
${FILL}print("ok")
`,
        stream_append: `import { Buffer, store8, window } from "std:buffer"
import { appendFile, writeFile } from "std:fs"
${FILL}let e = writeFile("${path}", [])
let k = 0
while k < N {
  if e == null { e = appendFile("${path}", window(b, k, WIN)) }
  k = k + WIN
}
if e != null { print(e.msg) } else { print("ok") }
`,
        stream_range: `import { Buffer, store8, window } from "std:buffer"
import { writeFile, writeFileRange } from "std:fs"
${FILL}let e = writeFile("${path}", [])
let k = 0
while k < N {
  if e == null { e = writeFileRange("${path}", k, window(b, k, WIN)) }
  k = k + WIN
}
if e != null { print(e.msg) } else { print("ok") }
`,
        whole_buf: `import { Buffer, store8 } from "std:buffer"
import { writeFile } from "std:fs"
${FILL}const e = writeFile("${path}", b)
if e != null { print(e.msg) } else { print("ok") }
`,
        // What a caller had to write before: copy the Buf out into a u8[], then write that.
        whole_array: `import { Buffer, loadBytes, store8 } from "std:buffer"
import { writeFile } from "std:fs"
${FILL}const e = writeFile("${path}", loadBytes(b, 0, N))
if e != null { print(e.msg) } else { print("ok") }
`,
      };
      const got: Record<string, { secs: number; rssKiB: number }> = {};
      for (const [name, src] of Object.entries(progs)) {
        const wasm = await build(dir, name, src);
        let best = { secs: Infinity, rssKiB: -1 };
        // Best of three: the box is shared, and the minimum is the least contended reading.
        for (let rep = 0; rep < 3; rep++) {
          await Deno.remove(path).catch(() => {});
          const r = await runBuilt(wasm);
          check(r.out, "ok", `${name} did not finish cleanly`);
          if (r.secs < best.secs) best = { secs: r.secs, rssKiB: r.rssKiB };
        }
        got[name] = best;
        if (name === "fill_only") continue;
        const bytes = await Deno.readFile(path);
        if (bytes.length !== SIZE) {
          throw new Error(`${name}: want ${SIZE} bytes, got ${bytes.length}`);
        }
        const sha = await sha256(bytes);
        if (sha !== wantSha) throw new Error(`${name}: the bytes differ from the pattern`);
      }
      for (const [name, r] of Object.entries(got)) {
        console.log(
          `  ${name.padEnd(13)} ${r.secs.toFixed(3)} s  peak RSS ${
            r.rssKiB < 0 ? "n/a" : `${Math.round(r.rssKiB / 1024)} MiB`
          }`,
        );
      }
      if (got.fill_only.rssKiB >= 0) {
        const fill = got.fill_only.rssKiB;
        for (const name of ["stream_append", "stream_range", "whole_buf"]) {
          // Writing from the Buf may cost buffers and page-cache noise, never a copy of it.
          if (got[name].rssKiB > fill + 16 * 1024) {
            throw new Error(
              `${name}: peak RSS ${got[name].rssKiB} KiB against ${fill} KiB for the fill ` +
                `alone — the Buf was copied on its way to the file`,
            );
          }
        }
        // And the control: the whole-array write DOES copy, at least once, or this suite
        // could not see a copy at all.
        if (got.whole_array.rssKiB < fill + (SIZE / 1024) * 0.9) {
          throw new Error(
            `whole_array: peak RSS ${got.whole_array.rssKiB} KiB is within one copy of the ` +
              `fill's ${fill} KiB — the control no longer measures a copy`,
          );
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  // Offsets past 4 GiB address the FILE: a sparse file 2^32 + 8 bytes long is patched in
  // place, extended at its end, and refused one byte past it with both numbers named.
  name: "std:fs: writeFileRange past 2^32 patches, extends, and refuses a gap",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fs_write_big_" });
    const path = `${dir}/sparse.bin`;
    const base = 2 ** 32;
    try {
      await Deno.writeFile(path, new Uint8Array(0));
      await Deno.truncate(path, base + 8);
      const got = await run(
        dir,
        "big",
        `import { Buffer, store8, window } from "std:buffer"
import { IoError, fileSize, writeFileRange } from "std:fs"
import { toString } from "std:fmt"

const p = "${path}"
const b = Buffer(4)
store8(b, 0, 7)
store8(b, 1, 8)
store8(b, 2, 9)
store8(b, 3, 10)
const x: i64 = ${base}
const e1 = writeFileRange(p, x + 2, [1, 2, 3])
if e1 != null { print(e1.msg) } else { print("patched") }
const e2 = writeFileRange(p, x + 8, window(b, 0, 4))
if e2 != null { print(e2.msg) } else { print("extended") }
const s = fileSize(p)
if s is IoError { print(s.msg) } else { print(toString(s)) }
const e3 = writeFileRange(p, x + 13, [1])
if e3 != null { print(e3.msg) } else { print("gap written") }
`,
      );
      check(
        got,
        [
          "patched",
          "extended",
          String(base + 12),
          `fs.writeFileRange ${path}: offset ${base + 13} is past the end (length ${base + 12})`,
        ].join("\n"),
        "the offsets past 2^32",
      );
      const f = await Deno.open(path, { read: true });
      try {
        await f.seek(base, Deno.SeekMode.Start);
        const buf = new Uint8Array(12);
        let n = 0;
        while (n < 12) {
          const k = await f.read(buf.subarray(n));
          if (k === null) break;
          n += k;
        }
        check(
          Array.from(buf.subarray(0, n)).join(","),
          "0,0,1,2,3,0,0,0,7,8,9,10",
          "the bytes at 2^32",
        );
      } finally {
        f.close();
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  // Creation, which the corpus cannot pin because `std:fs` has no delete to reset with:
  // `appendFile` and `writeFileRange` at 0 create a missing file, `writeFileRange` past 0
  // refuses one and creates nothing, and an append after a write adds to it.
  name: "std:fs: appendFile and writeFileRange create a missing file only where they should",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fs_write_create_" });
    try {
      const got = await run(
        dir,
        "create",
        `import { Buffer, store8 } from "std:buffer"
import { IoError, appendFile, pathExists, writeFile, writeFileRange } from "std:fs"

const b = Buffer(2)
store8(b, 0, 65)
store8(b, 1, 66)
const e1 = appendFile("${dir}/a.bin", b)
if e1 != null { print(e1.msg) }
const e2 = appendFile("${dir}/a.bin", [67])
if e2 != null { print(e2.msg) }
const e3 = writeFileRange("${dir}/r.bin", 0, b)
if e3 != null { print(e3.msg) }
const e4 = writeFileRange("${dir}/g.bin", 1, b)
if e4 != null { print(e4.msg) }
const ex = pathExists("${dir}/g.bin")
if ex is IoError { print(ex.msg) } else { print(ex) }
const e5 = writeFile("${dir}/w.bin", b)
if e5 != null { print(e5.msg) }
const e6 = appendFile("${dir}/w.bin", b)
if e6 != null { print(e6.msg) }
`,
      );
      check(
        got,
        [`fs.writeFileRange ${dir}/g.bin: offset 1 is past the end (length 0)`, "false"].join(
          "\n",
        ),
        "the creation rules",
      );
      check(await Deno.readTextFile(`${dir}/a.bin`), "ABC", "append created, then appended");
      check(await Deno.readTextFile(`${dir}/r.bin`), "AB", "range at 0 created");
      check(await Deno.readTextFile(`${dir}/w.bin`), "ABAB", "append after write");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  // The V8 harness cannot run the floor (a `u8[]` path is opaque to JS), so both new slots
  // must refuse with the documented sentence rather than answer something.
  name: "V8 harness — the two write slots refuse by name",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fs_write_v8_" });
    try {
      const cases: [string, string][] = [
        [
          "__fs_write_at__",
          `import { appendFile } from "std:fs"
const e = appendFile("/tmp/vl-fs-write-v8.bin", [1])
if e != null { print(e.msg) }
`,
        ],
        [
          "__fs_write_from__",
          `import { Buffer } from "std:buffer"
import { writeFileRange } from "std:fs"
const e = writeFileRange("/tmp/vl-fs-write-v8.bin", 0, Buffer(4))
if e != null { print(e.msg) }
`,
        ],
      ];
      for (const [slot, src] of cases) {
        const wasm = await Deno.readFile(await build(dir, slot, src));
        let refusal: unknown = null;
        try {
          await runWasm(wasm);
        } catch (err) {
          refusal = err;
        }
        const msg = refusal instanceof Error ? refusal.message : String(refusal);
        if (!msg.includes(slot) || !msg.includes("not available under the V8 harness")) {
          throw new Error(`want the documented V8 refusal naming ${slot}, got ${msg}`);
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
