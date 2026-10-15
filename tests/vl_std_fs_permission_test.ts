// `std:fs` TELLS EPERM FROM EACCES — the native `vl` binary over the shipping `std/fs.vl`.
//
// Rust reports both POSIX errnos as `ErrorKind::PermissionDenied`, so the host has to read
// the raw errno to keep them apart (`permission_errno` in scripts/vl-host/src/main.rs).
// This suite asks the OS for each one through a VL program and grades `errnoName`'s answer:
//   * EPERM: a write to `/proc/self/uid_map`. The initial user namespace's map is already
//     written and may be written only once, so the write fails EPERM for root as well.
//   * EACCES: a read of a mode-000 file. Root reads it anyway, so that half skips as root.
// Linux only: the EPERM witness is a Linux `/proc` file.
//
// The `vl_` prefix is load-bearing: it is one of the globs `ci-native` auto-discovers
// (tests/ci_seed_coverage_test.ts).
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm.
//
// @test-timing native

import { makeTempDir } from "./support/filePath.ts";
import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const LINUX = Deno.build.os === "linux";
const ENABLED = GATED && LINUX && exists(VL) && exists(COMPILER);
if (GATED && LINUX && !ENABLED) {
  console.warn(
    "[vl-std-fs-permission] skipped — missing vl binary or seed wasm.",
  );
}

const dec = new TextDecoder();

const PROGRAM =
  `import { writeTextFile, readFile, IoError, errnoName } from "std:fs"
import { programArgs, Utf8Error } from "std:args"

const a = programArgs()
if a is Utf8Error { print("bad args") } else {
  const w = writeTextFile("/proc/self/uid_map", "0 0 1\\n")
  if w == null { print("uid_map: ok") } else { print("uid_map: " + errnoName(w.code)) }
  if a.length > 0 {
    const r = readFile(a[0])
    if r is IoError { print("mode 000: " + errnoName(r.code)) } else { print("mode 000: ok") }
  }
}
`;

Deno.test({
  name: "std:fs: a POSIX EPERM answers EPERM and a POSIX EACCES answers EACCES",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await makeTempDir({ prefix: "vl_fs_permission_" });
    try {
      const entry = `${dir}/perm.vl`;
      await Deno.writeTextFile(entry, PROGRAM);
      const root = Deno.uid() === 0;
      const locked = `${dir}/locked`;
      await Deno.writeTextFile(locked, "x");
      await Deno.chmod(locked, 0o000);
      const { code, stdout, stderr } = await new Deno.Command(VL, {
        args: ["run", entry, "--", ...(root ? [] : [locked])],
        stdout: "piped",
        stderr: "piped",
        env: nativeEnv({ NO_COLOR: "1" }),
      }).output();
      const got = dec.decode(stdout).trimEnd();
      if (code !== 0) {
        throw new Error(
          `\`vl run\` exited ${code}\nstdout:\n${got}\nstderr:\n${
            dec.decode(stderr)
          }`,
        );
      }
      const want = [
        "uid_map: EPERM (operation not permitted)",
        ...(root ? [] : ["mode 000: EACCES (permission denied)"]),
      ].join("\n");
      if (got !== want) throw new Error(`want:\n${want}\ngot:\n${got}`);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
