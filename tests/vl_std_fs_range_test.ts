// `std:fs` RANGE READS OVER A FILE BIGGER THAN ONE READ — the native `vl` binary, over
// the shipping `std/fs.vl`.
//
// WHY THIS IS NOT A `tests/cases/` FIXTURE. The corpus pins the edge matrix
// (`tests/cases/std/fs-range.vl`: a middle window, a short one at the end, an empty one
// past it, zero length, a negative offset, a missing file) against a SIXTEEN-BYTE file,
// because a fixture has to be hermetic and cheap and cannot leave megabytes in `/tmp`.
// Sixteen bytes cannot show the thing `readFileRange` exists for: that the offset is a
// real seek rather than a slice of a whole-file read, which only a file no single read
// would want to materialise can demonstrate. So this suite writes one, scans it in
// windows, and deletes it.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native` auto-discovers
// (tests/ci_seed_coverage_test.ts), and a seed-backed test matching neither glob nor an
// explicit ci.yml step runs nowhere in CI.
//
// GATING: same as the other `vl_*`/`selfhost_native_*` suites — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm, so it
// self-ignores on a fresh clone and runs in `ci-native` (which has a seed).

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const STD = `${ROOT}/std`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-std-fs-range] skipped — missing vl binary or seed wasm.");
}

// 4 MiB, which is 64 times a whole-file read of anything the corpus writes and enough
// windows for a scan loop to iterate rather than finish on its first call.
const SIZE = 4 * 1024 * 1024;
// Byte `i` holds `i % 251`. A prime stride means the pattern does not repeat on any
// power-of-two window boundary, so a window read from the wrong offset — a page early,
// a window early, or from the start of the file — carries different bytes at every
// position rather than the same ones shifted.
const PATTERN = (i: number): number => i % 251;

const makeFile = async (path: string): Promise<void> => {
  const buf = new Uint8Array(SIZE);
  for (let i = 0; i < SIZE; i++) buf[i] = PATTERN(i);
  await Deno.writeFile(path, buf);
};

/** Compile and run `src` through the native `vl`, with `VL_STD` pinned to this tree. */
const run = async (src: string): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_std_fs_range_" });
  const entry = `${dir}/probe.vl`;
  await Deno.writeTextFile(entry, src);
  try {
    const { code, stdout, stderr } = await new Deno.Command(VL, {
      args: ["run", entry, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
      // VL_STD pins the std dir to THIS tree: agent worktrees symlink the cargo
      // target into the main checkout, so the binary's exe-relative std/ fallback
      // (/proc/self/exe resolves symlinks) would otherwise point at the WRONG one.
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

/** A probe over `path`: the size, one window at `off`, and a whole-file scan. */
const probeSrc = (path: string, off: number, len: number): string =>
  `import { toString } from "std:fmt"
import { IoError, fileSize, readFileRange } from "std:fs"

const p = "${path}"

const n = fileSize(p)
if n is IoError { print("SIZEERR " + toString(n.code)) } else { print("SIZE " + toString(n)) }

const w = readFileRange(p, ${off}, ${len})
if w is IoError {
  print("WERR " + toString(w.code))
} else {
  let s = "W " + toString(w.length)
  let i = 0
  while i < w.length {
    s = s + " " + toString(w[i])
    i = i + 1
  }
  print(s)
}

// The scan the consumer's own tool does: advance by what came back, stop on the empty
// answer. Nothing here knows the file's length, which is the point — the loop ends
// because the read said so, not because it was told how far to go.
let total: i64 = 0
let at: i64 = 0
let going = true
while going {
  const c = readFileRange(p, at, 1048576)
  if c is IoError {
    print("SCANERR " + toString(c.code))
    going = false
  } else {
    if c.length == 0 {
      going = false
    } else {
      total = total + c.length
      at = at + c.length
    }
  }
}
print("TOTAL " + toString(total))
`;

const wantWindow = (off: number, len: number): string => {
  const parts = [`W ${len}`];
  for (let k = 0; k < len; k++) parts.push(String(PATTERN(off + k)));
  return parts.join(" ");
};

Deno.test({
  // The fact `readFileRange` exists for: the offset is a seek into the file, so a window
  // taken from 3 MiB in holds the bytes that live there. Every earlier `std:fs` read had
  // to materialise the whole file to answer this, which a 2 GB file makes impossible.
  name:
    "std:fs: readFileRange seeks — a window past 3 MiB holds that offset's bytes",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fs_range_data_" });
    const path = `${dir}/pattern.bin`;
    try {
      await makeFile(path);
      const off = 3 * 1024 * 1024 + 12345;
      const got = await run(probeSrc(path, off, 12));
      const want = [`SIZE ${SIZE}`, wantWindow(off, 12), `TOTAL ${SIZE}`].join(
        "\n",
      );
      if (got !== want) throw new Error(`want:\n${want}\ngot:\n${got}`);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  // A window that runs off the end is SHORT, and the read after it is EMPTY without an
  // error — together those are the whole stop condition of a scan. Asserted here at a
  // real end-of-file rather than the corpus's sixteen bytes, because the short answer
  // has to survive the host's read loop, not just its bounds check.
  name:
    "std:fs: the last window is short and the one after it is empty, not an error",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fs_range_tail_" });
    const path = `${dir}/pattern.bin`;
    try {
      await makeFile(path);
      const off = SIZE - 5;
      const got = await run(probeSrc(path, off, 64));
      const want = [`SIZE ${SIZE}`, wantWindow(off, 5), `TOTAL ${SIZE}`].join(
        "\n",
      );
      if (got !== want) throw new Error(`want:\n${want}\ngot:\n${got}`);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  // `fileSize` is what a scan asks before it starts, so it has to agree with the bytes a
  // scan can actually reach. A file the test GROWS between two runs proves the answer is
  // read from the filesystem each time rather than cached anywhere.
  name: "std:fs: fileSize tracks the file, and matches what a scan reads back",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fs_range_size_" });
    const path = `${dir}/grow.bin`;
    try {
      await Deno.writeFile(path, new Uint8Array(1000));
      const first = await run(probeSrc(path, 0, 4));
      if (!first.startsWith("SIZE 1000\n")) {
        throw new Error(`want SIZE 1000 first\ngot:\n${first}`);
      }
      if (!first.endsWith("TOTAL 1000")) {
        throw new Error(`want TOTAL 1000\ngot:\n${first}`);
      }
      await Deno.writeFile(path, new Uint8Array(2500));
      const second = await run(probeSrc(path, 0, 4));
      if (!second.startsWith("SIZE 2500\n")) {
        throw new Error(`want SIZE 2500 after the growth\ngot:\n${second}`);
      }
      if (!second.endsWith("TOTAL 2500")) {
        throw new Error(`want TOTAL 2500\ngot:\n${second}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
