// THE PLUMB-SHAPE COST RATCHET'S OUTCOMES, PINNED — and the record of the port that retired the Python.
//
// `scripts/plumb-shape-cost.vl` was ported from a Python script (architecture-refactor-plan.md,
// T3). CPU and RSS are never the same twice, so the two were not run side by side: the port
// ran first with `$PLUMB_SHAPE_RECORD` set and wrote every raw reading it took (each timed
// child's CPU and peak RSS, each `wasm-opt` log's CPU total, each control, each `/proc/stat`
// pair, each load average), and the Python then ran with exactly those readings fed in where
// it would have taken its own. Everything else each computed for itself: the unit's sha, the
// fuel line, the rung input's two facts, every rounding and every line of the report. Against
// the stub `vl` below every outcome was byte-identical in report, exit code and baseline file:
// `--write-baseline`, a pass, a fuel OVER, an RSS OVER, both rung facts CHANGED, a changed
// unit, CPU graded on a busy box, another host, another `wasm-opt`, a host without
// `$VL_FUEL` with and without `--require-fuel`, one predating D2336, `--samples`, a missing
// baseline, one without a tail unit and a missing host. On the real tree (`--check` at
// a8efc18f3, the two run back to back) both printed the same fuel, unit and rung-fact lines,
// with peak RSS within 0.3 MB of each other. Readings are not reproducible, so the Python's
// reports were not frozen: this suite now holds the port to each outcome's exit code and the
// line that names it.
//
// Where the two could not agree, pinned below as the port's own behaviour:
//   1. The re-baseline command a message names is `vl run scripts/plumb-shape-cost.vl -- --write-baseline`.
//   2. A bad argument: both exited 2; the Python printed its docstring, the port a usage line.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER) &&
  exists("/usr/bin/time") && exists("/usr/bin/true");
if (GATED && !ENABLED) {
  console.warn(
    "[vl-plumb-shape-port] skipped — missing vl, the seed, /usr/bin/time or /usr/bin/true.",
  );
}

const dec = new TextDecoder();
type Out = { code: number; out: string };

const REWRITE = "  vl run scripts/plumb-shape-cost.vl -- --write-baseline";

// A stand-in for `vl`: writes a unit, prints a fuel line, and calls `$VL_WASM_OPT` the way the
// host's `-O` does (an escape call, then the rung with or without `--skip-pass`).
const stub = (skipLiteral: string) =>
  `#!/bin/sh
case "$1" in
run)
  case "$2" in *.wasm)
    if [ -n "$STUB_BURN" ]; then
      n=$(($(cat "$STUB_BURN.n" 2>/dev/null || echo 0) + 1))
      echo $n > "$STUB_BURN.n"
      case " $STUB_BURN_AT " in *" $n "*)
        i=0; while [ $i -lt 300000 ]; do i=$((i + 1)); done ;;
      esac
    fi
    exit 0 ;;
  esac
  out=""; shape=main
  while [ $# -gt 0 ]; do
    case "$1" in -o) out="$2"; shift ;; --shape) shape="$2"; shift ;; esac
    shift
  done
  printf 'unit %s %s\\n' "\${STUB_GEN:-a}" "$shape" > "$out"
  ;;
build)
  if [ "$2" != unit.vl ]; then
    for a; do last="$a"; done
    : > "$last"
    exit 0
  fi
  shape=$(cut -d' ' -f3 unit.vl)
  if [ "$VL_FUEL" = 1 ] && [ "\${STUB_FUEL:-5000}" != none ]; then
    f=\${STUB_FUEL:-5000}
    if [ "$shape" = tail ]; then f=$((f / 2)); fi
    echo "[fuel] guest: $f" >&2
  fi
  : > in.wasm
  i=0
  while [ $i -lt "\${STUB_IFS:-0}" ]; do printf '\\101\\001\\004\\100' >> in.wasm; i=$((i + 1)); done
  printf 'x' >> in.wasm
  "$VL_WASM_OPT" in.wasm --strip -o esc.wasm || exit $?
  if [ "$shape" = tail ] && [ "\${STUB_SKIP:-1}" = 1 ]; then
    "$VL_WASM_OPT" in.wasm -O ${skipLiteral} -o unit.wasm || exit $?
  else
    "$VL_WASM_OPT" in.wasm -O -o unit.wasm || exit $?
  fi
  ;;
esac
`;

const cpuModel = (): string => {
  for (const l of Deno.readTextFileSync("/proc/cpuinfo").split("\n")) {
    if (l.startsWith("model name")) return l.split(":")[1].trim();
  }
  return "unknown";
};

Deno.test({
  name: "plumb-shape cost: each outcome's exit code and the line that names it",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_plumb_shape_port_" });
    const BASE = `${dir}/scripts/plumb-shape-baseline.json`;
    const spawn = async (
      cmd: string,
      args: string[],
      extra: Record<string, string>,
    ): Promise<Out> => {
      const { code, stdout, stderr } = await new Deno.Command(cmd, {
        args,
        cwd: dir,
        stdout: "piped",
        stderr: "piped",
        env: nativeEnv({
          NO_COLOR: "1",
          PATH: `${dir}/bin:${Deno.env.get("PATH") ?? ""}`,
          VL: `${dir}/vl`,
          SEED: `${dir}/seed.wasm`,
          PLUMB_SHAPE_RUNS: "2",
          ...extra,
        }),
      }).output();
      return { code, out: dec.decode(stdout) + dec.decode(stderr) };
    };
    const port = (argv: string[], extra = {}) =>
      spawn(VL, ["run", `${dir}/port.wasm`, "--", ...argv], extra);
    const read = (p: string) => Deno.readTextFile(p).catch(() => "<absent>");
    // The port against a fresh copy of `base` (none when null).
    const outcome = async (
      _label: string,
      argv: string[],
      extra: Record<string, string> = {},
      base: string | null = null,
    ): Promise<Out> => {
      if (base === null) await Deno.remove(BASE).catch(() => {});
      else await Deno.writeTextFile(BASE, base);
      return await port(argv, extra);
    };
    const expect = (label: string, o: Out, code: number, needle: string) => {
      if (o.code !== code || !o.out.includes(needle)) {
        throw new Error(
          `${label}: want exit ${code} and \`${needle}\`, got exit ${o.code}:\n${o.out}`,
        );
      }
    };
    try {
      await Deno.mkdir(`${dir}/scripts/perf`, { recursive: true });
      await Deno.mkdir(`${dir}/bin`);
      await Deno.writeTextFile(`${dir}/scripts/perf/gen-plumb-shape.vl`, "");
      await Deno.writeTextFile(`${dir}/scripts/plumb-shape-cost.vl`, "");
      await Deno.writeTextFile(`${dir}/seed.wasm`, "");
      // A native `wasm-opt` that does nothing: an ELF file, so the port does not skip it.
      await Deno.copyFile("/usr/bin/true", `${dir}/bin/wasm-opt`);
      await Deno.chmod(`${dir}/bin/wasm-opt`, 0o755);
      await Deno.writeTextFile(`${dir}/vl`, stub("--skip-pass=ssa-nomerge"));
      await Deno.writeTextFile(
        `${dir}/vl-old`,
        stub('"--skip-pass=ssa-"nomerge'),
      );
      await Deno.chmod(`${dir}/vl`, 0o755);
      await Deno.chmod(`${dir}/vl-old`, 0o755);
      const b = await new Deno.Command(VL, {
        args: [
          "build",
          `${ROOT}/scripts/plumb-shape-cost.vl`,
          "--compiler",
          COMPILER,
          "-o",
          `${dir}/port.wasm`,
        ],
        env: nativeEnv(),
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (b.code !== 0) {
        throw new Error(`the port must build:\n${dec.decode(b.stderr)}`);
      }

      const w = await outcome("--write-baseline", ["--write-baseline"]);
      expect(
        "--write-baseline",
        w,
        0,
        "wrote scripts/plumb-shape-baseline.json",
      );
      const row = JSON.parse(await read(BASE));
      if (row.cpu_host !== cpuModel() || row.tail?.skip_ssa !== true) {
        throw new Error(
          `the written baseline is not this host's:\n${JSON.stringify(row)}`,
        );
      }
      // A baseline the port grades CPU against, every run quiet and every bar met. RSS is
      // set far above the stub's ~2 MB, which varies by 10% between runs on its own.
      const doctor = (f: (r: Record<string, unknown>) => void) => {
        const r = JSON.parse(JSON.stringify(row));
        for (const u of [r, r.tail]) {
          Object.assign(u, {
            control_cpu: 100,
            compile_cpu: 100,
            opt_cpu: 100,
            rss_mb: 100,
          });
        }
        f(r);
        return JSON.stringify(r) + "\n";
      };
      const ok = doctor(() => {});
      expect(
        "a pass",
        await outcome("a pass", ["--check"], {}, ok),
        0,
        "plumb-shape cost ok",
      );
      const fuelRise = await outcome(
        "a fuel rise",
        ["--check"],
        {},
        doctor((r) => (r.fuel = 4000)),
      );
      expect(
        "a fuel rise (the must-red control)",
        fuelRise,
        1,
        "main fuel        ",
      );
      // Disagreement 1: the re-baseline command the port names is its own.
      expect("a fuel rise names the port", fuelRise, 1, REWRITE);
      expect(
        "an RSS rise",
        await outcome(
          "an RSS rise",
          ["--check"],
          {},
          doctor((r) => {
            r.rss_mb = 0.5;
            (r.tail as Record<string, unknown>).rss_mb = 0.5;
          }),
        ),
        1,
        "COST REGRESSION (main peak RSS, tail peak RSS)",
      );
      expect(
        "both rung facts",
        await outcome("both rung facts", ["--check"], {
          STUB_IFS: "2",
          STUB_SKIP: "0",
        }, ok),
        1,
        "tail skips ssa-nomerge False against True CHANGED",
      );
      expect(
        "a changed unit",
        await outcome("a changed unit", ["--check"], { STUB_GEN: "b" }, ok),
        1,
        "PLUMB-SHAPE UNIT CHANGED",
      );
      // The port's 1st control call warms it; its 2nd and 4th (main's runs 0 and 2) burn.
      await Deno.remove(`${dir}/burn.n`).catch(() => {});
      const busy = await outcome("a busy box", ["--check"], {
        STUB_BURN: `${dir}/burn`,
        STUB_BURN_AT: "2 4",
        PLUMB_SHAPE_RUNS: "3",
      }, doctor((r) => (r.control_cpu = 0.05)));
      expect("a busy box", busy, 0, "box busy — 1 of 3 runs");
      expect("a busy box", busy, 0, "(1 quiet of 3 runs");
      // The stub's child CPU is real, so the reading is 0.00s or 0.01s depending on load.
      expect("a quiet unit", busy, 0, "tail compile ");
      if (!/tail compile +0\.0\ds against/.test(busy.out)) {
        throw new Error(
          `a quiet unit: want a near-zero \`tail compile\` CPU line:\n${busy.out}`,
        );
      }
      expect(
        "another host",
        await outcome(
          "another host",
          ["--check"],
          {},
          doctor((r) => (r.cpu_host = "Other")),
        ),
        0,
        "the baseline's `Other`",
      );
      expect(
        "another wasm-opt",
        await outcome(
          "another wasm-opt",
          ["--check"],
          {},
          doctor((r) => (r.wasm_opt = "w 1")),
        ),
        0,
        "the baseline's `w 1`",
      );
      expect(
        "no fuel line",
        await outcome("no fuel line", ["--check"], { STUB_FUEL: "none" }, ok),
        0,
        "predates $VL_FUEL",
      );
      expect(
        "no fuel line, required",
        await outcome("no fuel, required", ["--check", "--require-fuel"], {
          STUB_FUEL: "none",
        }, ok),
        1,
        "--require-fuel was given",
      );
      expect(
        "a host before D2336",
        await outcome(
          "a host before D2336",
          ["--check"],
          { VL: `${dir}/vl-old` },
          ok,
        ),
        0,
        "predates D2336",
      );
      expect(
        "--samples",
        await outcome("--samples", ["--samples"], {}, ok),
        0,
        "  run 1: control",
      );
      expect(
        "no baseline",
        await outcome("no baseline", ["--check"]),
        1,
        "No such file or directory",
      );
      expect(
        "no tail unit",
        await outcome(
          "no tail unit",
          ["--check"],
          {},
          doctor((r) => delete r.tail),
        ),
        1,
        "has no tail unit",
      );
      expect(
        "no host",
        await outcome("no host", ["--check"], { VL: `${dir}/nope` }, ok),
        1,
        "plumb-shape: missing",
      );
      // Disagreement 2: a bad argument.
      const vu = await port(["--bogus"]);
      if (vu.code !== 2 || !vu.out.startsWith("usage:")) {
        throw new Error(
          `a bad argument: want exit 2 and a usage line, got ${vu.code}:\n${vu.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
