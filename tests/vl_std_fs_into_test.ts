// `std:fs` READS INTO LINEAR MEMORY OVER A FILE BIGGER THAN ONE READ — the native `vl`
// binary, over the shipping `std/fs.vl`.
//
// WHY THIS IS NOT A `tests/cases/` FIXTURE. The corpus pins the edge matrix
// (`tests/cases/std/fs-into.vl`: a buffer with room to spare, one smaller than the file,
// a window inside the buffer, a short read at the end, zero past it, an empty buffer, a
// negative offset, a destination offset outside the buffer, a missing file, a directory)
// against a SIXTEEN-BYTE file, because a fixture has to be hermetic and cheap and cannot
// leave megabytes in `/tmp`. Sixteen bytes cannot show the two things these exports exist
// for: that the bytes land in memory the caller already owns rather than in a fresh
// allocation, and that a scan can walk a file in windows of one reused buffer. So this
// suite writes a file no single allocation should want to hold, walks it, checks every
// byte against a known pattern, and deletes it.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native` auto-discovers
// (tests/ci_seed_coverage_test.ts), and a seed-backed test matching neither glob nor an
// explicit ci.yml step runs nowhere in CI.
//
// GATING: same as the other `vl_*`/`selfhost_native_*` suites — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm, so it
// self-ignores on a fresh clone and runs in `ci-native` (which has a seed).
//
// @test-timing native

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const STD = `${ROOT}/std`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-std-fs-into] skipped — missing vl binary or seed wasm.");
}

// 4 MiB — 64 times a whole-file read of anything the corpus writes, and enough windows
// for a scan loop to iterate rather than finish on its first call.
const SIZE = 4 * 1024 * 1024;
// Byte `i` holds `i % 251`. A prime stride means the pattern does not repeat on any
// power-of-two window boundary, so a window read from the wrong offset — a page early, a
// window early, or from the start of the file — carries different bytes at every position
// rather than the same ones shifted.
const PATTERN = (i: number): number => i % 251;

const makeFile = async (path: string): Promise<void> => {
  const buf = new Uint8Array(SIZE);
  for (let i = 0; i < SIZE; i++) buf[i] = PATTERN(i);
  await Deno.writeFile(path, buf);
};

/** Compile and run `src` through the native `vl`, with `VL_STD` pinned to this tree. */
const run = async (src: string): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_std_fs_into_" });
  const entry = `${dir}/probe.vl`;
  await Deno.writeTextFile(entry, src);
  try {
    const { code, stdout, stderr } = await new Deno.Command(VL, {
      args: ["run", entry, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
      // VL_STD pins the std dir to THIS tree: agent worktrees symlink the cargo target
      // into the main checkout, so the binary's exe-relative std/ fallback (and the copy
      // baked into a release build) would otherwise be the WRONG one.
      env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: STD },
    }).output();
    const dec = new TextDecoder();
    const out = dec.decode(stdout);
    if (code !== 0) {
      throw new Error(
        `\`vl run\` exited ${code}\nstdout:\n${out}\nstderr:\n${
          dec.decode(stderr)
        }`,
      );
    }
    return out.trimEnd();
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const check = (got: string, want: string) => {
  if (got !== want) throw new Error(`want:\n${want}\ngot:\n${got}`);
};

Deno.test({
  // The whole file into ONE buffer, with every byte checked against the pattern. This is
  // the shape the export exists for — the bytes arrive where the caller put the buffer,
  // and nothing the size of the file is allocated on the way.
  name: "std:fs: readFileInto lands a whole 4 MiB file in one Buf, byte for byte",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fs_into_whole_" });
    const path = `${dir}/pattern.bin`;
    try {
      await makeFile(path);
      const got = await run(
        `import { Buffer, loadU8 } from "std:buffer"
import { IoError, readFileInto } from "std:fs"
import { toString } from "std:fmt"

const b = Buffer(${SIZE})
const n = readFileInto("${path}", b, 0)
if n is IoError {
  print("ERR " + toString(n.code))
} else {
  print("N " + toString(n))
  let bad = 0
  let i = 0
  while i < n {
    if loadU8(b, i) != i % 251 { bad = bad + 1 }
    i = i + 1
  }
  print("BAD " + toString(bad))
}
`,
      );
      check(got, [`N ${SIZE}`, "BAD 0"].join("\n"));
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  // The scan a consumer actually writes: ONE buffer, reused window after window, advancing
  // by what came back and stopping on the 0 that says the file is over. Nothing here knows
  // the file's length — the loop ends because the read said so. Every byte is checked
  // against its own file offset, so a window read from the wrong place is not a count that
  // still adds up.
  name: "std:fs: readFileRangeInto walks a file in windows of one reused Buf",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fs_into_scan_" });
    const path = `${dir}/pattern.bin`;
    try {
      await makeFile(path);
      const got = await run(
        `import { Buffer, loadU8 } from "std:buffer"
import { IoError, readFileRangeInto } from "std:fs"
import { toString } from "std:fmt"

const WIN = 65536
const b = Buffer(WIN)
let total: i64 = 0
let at: i64 = 0
let bad = 0
let windows = 0
let going = true
while going {
  const n = readFileRangeInto("${path}", at, b, 0)
  if n is IoError {
    print("ERR " + toString(n.code))
    going = false
  } else {
    if n == 0 {
      going = false
    } else {
      windows = windows + 1
      let i = 0
      while i < n {
        if loadU8(b, i) != (at + i) % 251 { bad = bad + 1 }
        i = i + 1
      }
      total = total + n
      at = at + n
    }
  }
}
print("TOTAL " + toString(total))
print("WINDOWS " + toString(windows))
print("BAD " + toString(bad))
`,
      );
      check(
        got,
        [`TOTAL ${SIZE}`, `WINDOWS ${SIZE / 65536}`, "BAD 0"].join("\n"),
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  // A buffer SMALLER than the file fills exactly and says so, and a second read at the
  // destination offset the first one ended at continues where it left off — the two halves
  // of one buffer, assembled without moving a byte afterwards. A `dstOff` that leaves no
  // room is 0 rather than an error, which is what ends such a loop.
  name: "std:fs: a Buf smaller than the file fills exactly, and dstOff assembles it",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fs_into_part_" });
    const path = `${dir}/pattern.bin`;
    try {
      await makeFile(path);
      const got = await run(
        `import { Buffer, loadU8 } from "std:buffer"
import { IoError, readFileInto, readFileRangeInto } from "std:fs"
import { toString } from "std:fmt"

const HALF = 1000
const b = Buffer(2 * HALF)

// A buffer that cannot hold the file takes exactly what it has room for.
const first = readFileInto("${path}", b, 0)
if first is IoError { print("ERR1 " + toString(first.code)) } else {
  print("FIRST " + toString(first))
}

// The second half, landing after the first — the file continues at byte HALF.
const second = readFileRangeInto("${path}", HALF, b, HALF)
if second is IoError { print("ERR2 " + toString(second.code)) } else {
  print("SECOND " + toString(second))
}

// A destination offset at the very end leaves no room, which is 0 and not an error.
const nothing = readFileInto("${path}", b, 2 * HALF)
if nothing is IoError { print("ERR3 " + toString(nothing.code)) } else {
  print("NONE " + toString(nothing))
}

let bad = 0
let i = 0
while i < 2 * HALF {
  if loadU8(b, i) != i % 251 { bad = bad + 1 }
  i = i + 1
}
print("BAD " + toString(bad))
`,
      );
      check(
        got,
        ["FIRST 2000", "SECOND 1000", "NONE 0", "BAD 0"].join("\n"),
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  // The two reads have to answer the SAME bytes, or a consumer cannot move a scan from the
  // allocating one to the one that writes into memory. Asserted at a real offset past 3 MiB
  // rather than the corpus's sixteen bytes, because the agreement has to survive the host's
  // seek and its read loop, not just its bounds check.
  name: "std:fs: readFileRangeInto agrees with readFileRange at a 3 MiB offset",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fs_into_agree_" });
    const path = `${dir}/pattern.bin`;
    try {
      await makeFile(path);
      const off = 3 * 1024 * 1024 + 12345;
      const got = await run(
        `import { Buffer, loadU8 } from "std:buffer"
import { IoError, readFileRange, readFileRangeInto } from "std:fs"
import { toString } from "std:fmt"

const LEN = 4096
const b = Buffer(LEN)
const n = readFileRangeInto("${path}", ${off}, b, 0)
const want = readFileRange("${path}", ${off}, LEN)
if n is IoError {
  print("ERR " + toString(n.code))
} else if want is IoError {
  print("WERR " + toString(want.code))
} else {
  print("N " + toString(n) + " " + toString(want.length))
  let bad = 0
  let i = 0
  while i < want.length {
    if loadU8(b, i) != want[i] { bad = bad + 1 }
    i = i + 1
  }
  print("BAD " + toString(bad))
  print("FIRST " + toString(loadU8(b, 0)))
}
`,
      );
      check(
        got,
        [`N 4096 4096`, "BAD 0", `FIRST ${PATTERN(off)}`].join("\n"),
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
