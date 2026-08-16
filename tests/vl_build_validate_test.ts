// NATIVE `vl build` — the module it writes must be one the ENGINE will accept.
//
// `compileSrc` returning 0 means "the emitter ran to completion", NOT "the bytes
// are a valid wasm module": the validator lives in wasmtime and the compiler is a
// VL program inside the guest with no engine of its own. So `vl build` used to
// write an un-instantiable module, print `wrote x.wasm (N bytes)`, and exit 0 —
// measured on master `08469b0`:
//
//   vl run   t.vl              rc 1   "expected i32, found (ref null $type)"
//   vl check t.vl              rc 0
//   vl check --codegen t.vl    rc 0
//   vl build t.vl -o x.wasm    rc 0   ← blessed the invalid artifact
//   vl run   x.wasm            rc 1   same error, on the file build blessed
//
// `vl build` now runs `Module::validate` (the same check `vl run` fails on, minus
// the Cranelift codegen) over the written artifact and exits 1 when it fails.
// `--no-validate` restores the old write-and-bless path.
//
// The artifact is deliberately LEFT ON DISK on failure and validation runs after
// `--wat`: a module that fails to validate is exactly the one a compiler dev needs
// to disassemble. The exit code, not the artifact's absence, is the signal.
//
// FIXTURE MAINTENANCE: `INVALID_SRC` rides a LIVE hole (container variance — an `i32[]`
// assigned into an `f64[]`). If that hole is closed the fixture stops producing an
// invalid module and this pin would silently go inert — so the first assertion checks
// the PRECONDITION (`vl run` on the source still fails) and fails loudly with a swap
// instruction rather than passing vacuously. Swap in any other source that emits an
// invalid module; the whole corpus had none (1,411 files swept, 0 divergences), which
// is why the fixture must be constructed.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-build-validate] skipped — missing vl binary or seed wasm.");
}

// Type-checks clean, emits invalid wasm: an `i32[]` flowing into an `f64[]` binding.
// The checker accepts the assignment while the two lists have DIFFERENT heap types, so
// the store is `(ref $i32list)` into a `(ref null $f64list)` slot —
// `type mismatch: expected (ref null $type), found (ref $type)`. This is the N5/A8/A9
// CONTAINER VARIANCE ruling in `docs/internals/open-rulings.md`, an open checker hole
// rather than an emitter one, which is what makes the fixture stable: closing it is a
// `vl check` reject, and a `vl check` reject would be caught by the precondition
// assertion below rather than silently blessing this pin.
//
// It REPLACES the narrowed-litunion-arm fixture — `const x: K | f64 = "aa"; if x is K {
// const y: K = x }` — which stopped emitting an invalid module once `emitStrToAtom`
// gave the string→atom rep boundary its conversion. That one had itself replaced a
// `.map` callback PARAMETER spelled as the inline member union, and that one an unread
// global binding of a generic function's nullable-closure return. The precondition
// assertion below is what caught all three, exactly as designed.
const INVALID_SRC = `const a = [1, 2]\n` +
  `const b: f64[] = a\n` +
  `print(b[0])\n`;

// The over-rejection control: an ordinary valid program must still build clean.
const VALID_SRC = `print(6 * 7)\n`;

type Res = { code: number; out: string; err: string };

const vl = async (args: string[]): Promise<Res> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

/** Write `src` to a temp dir and hand the callback the source + output paths. */
const withCase = async (
  src: string,
  fn: (srcPath: string, outPath: string) => Promise<void>,
): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_build_validate_" });
  try {
    const srcPath = `${dir}/probe.vl`;
    await Deno.writeTextFile(srcPath, src);
    await fn(srcPath, `${dir}/probe.wasm`);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test({
  name:
    "vl-build-validate: a module that cannot instantiate fails the build (rc 1), artifact still written",
  ignore: !ENABLED,
  fn: async () => {
    await withCase(INVALID_SRC, async (srcPath, outPath) => {
      // PRECONDITION — the fixture must still emit an invalid module, else this
      // pin is inert. `vl run` is the independent witness (it has always rejected).
      const ran = await vl(["run", srcPath]);
      if (ran.code === 0) {
        throw new Error(
          "the fixture no longer emits an invalid module (vl run exited 0) — the underlying " +
            "emitter bug was fixed. Swap INVALID_SRC for another source that emits invalid wasm; " +
            "do NOT delete this pin.",
        );
      }

      const built = await vl(["build", srcPath, "-o", outPath]);
      if (built.code === 0) {
        throw new Error(
          `vl build blessed a module vl run rejects: build rc 0, run rc ${ran.code}.\n` +
            `  build stdout: ${built.out.trim()}\n  run stderr: ${ran.err.trim().split("\n")[0]}`,
        );
      }
      if (built.code !== 1) {
        throw new Error(
          `expected rc 1 (vl run's code for an unusable module; 2 is reserved for usage errors), got ${built.code}`,
        );
      }
      if (!/not a valid WebAssembly module/.test(built.err)) {
        throw new Error(
          `the failure must name the artifact as invalid, got:\n${built.err}`,
        );
      }
      // Left on disk on purpose — it is the thing you disassemble to debug.
      if (!exists(outPath)) {
        throw new Error("the invalid artifact must still be written (for --wat / triage)");
      }
    });
  },
});

Deno.test({
  name: "vl-build-validate: --no-validate opts back out (rc 0, module written)",
  ignore: !ENABLED,
  fn: async () => {
    await withCase(INVALID_SRC, async (srcPath, outPath) => {
      const r = await vl(["build", srcPath, "-o", outPath, "--no-validate"]);
      if (r.code !== 0) {
        throw new Error(`--no-validate must restore the old path, got rc ${r.code}:\n${r.err}`);
      }
      if (!exists(outPath)) throw new Error("--no-validate must still write the module");
    });
  },
});

Deno.test({
  name:
    "vl-build-validate: a valid program still builds clean and the artifact runs (no over-rejection)",
  ignore: !ENABLED,
  fn: async () => {
    await withCase(VALID_SRC, async (srcPath, outPath) => {
      const built = await vl(["build", srcPath, "-o", outPath]);
      if (built.code !== 0) {
        throw new Error(`validation rejected a valid module (rc ${built.code}):\n${built.err}`);
      }
      if (!/^wrote /m.test(built.out)) {
        throw new Error(`expected the "wrote …" report, got: ${JSON.stringify(built.out)}`);
      }
      // The blessing must be worth something: the artifact instantiates and runs.
      const ran = await vl(["run", outPath]);
      if (ran.code !== 0 || ran.out.trim() !== "42") {
        throw new Error(
          `the blessed artifact did not run: rc ${ran.code}, out ${JSON.stringify(ran.out)}`,
        );
      }
    });
  },
});
