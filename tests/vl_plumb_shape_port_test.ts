// THE VL PORT OF THE PLUMB-SHAPE COST RATCHET AGREES WITH THE PYTHON, on one measurement.
//
// `scripts/plumb-shape-cost.vl` ports `scripts/plumb-shape-cost.py` (architecture-refactor-plan.md,
// T3). CPU and RSS are never the same twice, so the two are not run side by side: the port
// runs first with `$PLUMB_SHAPE_RECORD` set and writes every raw reading it took (each timed
// child's CPU and peak RSS, each `wasm-opt` log's CPU total, each control, each `/proc/stat`
// pair, each load average), and the Python then runs with exactly those readings fed in where
// it would have taken its own (`os.wait4`, `read_opt_log`'s total, `control`, `box_ticks`,
// `os.getloadavg`). Everything else each computes for itself: the unit's sha, the fuel line,
// the rung input's two facts (each through its own `wasm-opt` wrapper), every rounding and
// every line of the report. A stub `vl` stands in for the host so each outcome is reachable:
// `--write-baseline` (the file byte for byte), a pass, a fuel OVER (the must-red control), an
// RSS OVER, both rung facts CHANGED, a changed unit, CPU graded, busy, on another host and
// with another `wasm-opt`, a host without `$VL_FUEL` with and without `--require-fuel`, one
// predating D2336, `--samples`, a missing baseline, one without a tail unit, a missing host.
//
// Where they cannot agree, pinned below rather than left as prose:
//   1. The re-baseline command a message names is each tool's own.
//   2. A bad argument: both exit 2; the Python prints its docstring, the port a usage line.
//
// @test-timing native

import {
  COMPILER,
  exists,
  nativeEnv,
  pythonBin,
  ROOT,
  VL,
} from "./support/tree.ts";

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

const PY_REWRITE = "  python3 scripts/plumb-shape-cost.py --write-baseline";
const VL_REWRITE = "  vl run scripts/plumb-shape-cost.vl -- --write-baseline";

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

// The Python, its readings replaced by the ones the port recorded.
const REPLAY = `import collections, importlib.util, os, sys
rec, argv = sys.argv[1], sys.argv[2:]
q = collections.defaultdict(list)
if os.path.exists(rec):
    for line in open(rec):
        k, *v = line.split()
        q[k].append(v)
def take(k):
    return q[k].pop(0)
spec = importlib.util.spec_from_file_location("psc", os.path.join(os.getcwd(), "scripts", "plumb-shape-cost.py"))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class RU:
    def __init__(self, cpu, kb):
        self.ru_utime, self.ru_stime, self.ru_maxrss = cpu, 0.0, kb
real_wait4 = os.wait4
def wait4(pid, opts):
    p, st, _ = real_wait4(pid, opts)
    cpu, kb = take("run")
    return p, st, RU(float(cpu), int(kb))
os.wait4 = wait4
real_read = m.read_opt_log
def read_opt_log(log):
    return float(take("opt")[0]), real_read(log)[1]
m.read_opt_log = read_opt_log
m.control = lambda: float(take("ctl")[0])
m.box_ticks = lambda: tuple(int(x) for x in take("ticks"))
os.getloadavg = lambda: (float(take("load")[0]),) * 3
sys.exit(m.main(["plumb-shape-cost.py"] + argv))
`;

const cpuModel = (): string => {
  for (const l of Deno.readTextFileSync("/proc/cpuinfo").split("\n")) {
    if (l.startsWith("model name")) return l.split(":")[1].trim();
  }
  return "unknown";
};

Deno.test({
  name:
    "plumb-shape cost: the VL port prints the Python's report from the same readings",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_plumb_shape_port_" });
    const BASE = `${dir}/scripts/plumb-shape-baseline.json`;
    const REC = `${dir}/record.txt`;
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
          PLUMB_SHAPE_RECORD: REC,
          ...extra,
        }),
      }).output();
      return { code, out: dec.decode(stdout) + dec.decode(stderr) };
    };
    const port = (argv: string[], extra = {}) =>
      spawn(VL, ["run", `${dir}/port.wasm`, "--", ...argv], extra);
    const py = (argv: string[], extra = {}) =>
      spawn(pythonBin(), [`${dir}/replay.py`, REC, ...argv], extra);
    const read = (p: string) => Deno.readTextFile(p).catch(() => "<absent>");
    // The port, then the Python on its readings; the same exit code, report and baseline.
    const agree = async (
      label: string,
      argv: string[],
      extra: Record<string, string> = {},
      base: string | null = null,
    ): Promise<Out> => {
      const reset = async () => {
        if (base === null) await Deno.remove(BASE).catch(() => {});
        else await Deno.writeTextFile(BASE, base);
      };
      await Deno.remove(REC).catch(() => {});
      await reset();
      const v = await port(argv, extra);
      const vf = await read(BASE);
      await reset();
      const p = await py(argv, extra);
      const pf = await read(BASE);
      const pout = p.out.replaceAll(PY_REWRITE, VL_REWRITE);
      if (p.code !== v.code || pout !== v.out) {
        throw new Error(
          `${label}: the port disagrees with the Python.\n` +
            `want exit ${p.code}:\n${pout}\ngot exit ${v.code}:\n${v.out}`,
        );
      }
      if (pf !== vf) {
        throw new Error(
          `${label}: the baseline differs.\nwant:\n${pf}\ngot:\n${vf}`,
        );
      }
      return v;
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
      await Deno.copyFile(
        `${ROOT}/scripts/plumb-shape-cost.py`,
        `${dir}/scripts/plumb-shape-cost.py`,
      );
      await Deno.chmod(`${dir}/scripts/plumb-shape-cost.py`, 0o755);
      await Deno.writeTextFile(`${dir}/scripts/perf/gen-plumb-shape.vl`, "");
      await Deno.writeTextFile(`${dir}/scripts/plumb-shape-cost.vl`, "");
      await Deno.writeTextFile(`${dir}/seed.wasm`, "");
      await Deno.writeTextFile(`${dir}/replay.py`, REPLAY);
      // A native `wasm-opt` that does nothing: an ELF file, so neither tool skips it.
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

      const w = await agree("--write-baseline", ["--write-baseline"]);
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
      // A baseline both tools grade CPU against, every run quiet and every bar met.
      const doctor = (f: (r: Record<string, unknown>) => void) => {
        const r = JSON.parse(JSON.stringify(row));
        for (const u of [r, r.tail]) {
          Object.assign(u, {
            control_cpu: 100,
            compile_cpu: 100,
            opt_cpu: 100,
          });
        }
        f(r);
        return JSON.stringify(r) + "\n";
      };
      const ok = doctor(() => {});
      expect(
        "a pass",
        await agree("a pass", ["--check"], {}, ok),
        0,
        "plumb-shape cost ok",
      );
      expect(
        "a fuel rise (the must-red control)",
        await agree(
          "a fuel rise",
          ["--check"],
          {},
          doctor((r) => (r.fuel = 4000)),
        ),
        1,
        "main fuel        ",
      );
      expect(
        "an RSS rise",
        await agree(
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
        await agree("both rung facts", ["--check"], {
          STUB_IFS: "2",
          STUB_SKIP: "0",
        }, ok),
        1,
        "tail skips ssa-nomerge False against True CHANGED",
      );
      expect(
        "a changed unit",
        await agree("a changed unit", ["--check"], { STUB_GEN: "b" }, ok),
        1,
        "PLUMB-SHAPE UNIT CHANGED",
      );
      // The port's 1st control call warms it; its 2nd and 4th (main's runs 0 and 2) burn.
      await Deno.remove(`${dir}/burn.n`).catch(() => {});
      const busy = await agree("a busy box", ["--check"], {
        STUB_BURN: `${dir}/burn`,
        STUB_BURN_AT: "2 4",
        PLUMB_SHAPE_RUNS: "3",
      }, doctor((r) => (r.control_cpu = 0.05)));
      expect("a busy box", busy, 0, "box busy — 1 of 3 runs");
      expect("a busy box", busy, 0, "(1 quiet of 3 runs");
      // The stub's child CPU is real, so the reading is 0.00s or 0.01s depending on load; the
      // port-vs-Python agreement above already fixes the digits, this fixes only "quiet".
      expect("a quiet unit", busy, 0, "tail compile ");
      if (!/tail compile +0\.0\ds against/.test(busy.out)) {
        throw new Error(
          `a quiet unit: want a near-zero \`tail compile\` CPU line:\n${busy.out}`,
        );
      }
      expect(
        "another host",
        await agree(
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
        await agree(
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
        await agree("no fuel line", ["--check"], { STUB_FUEL: "none" }, ok),
        0,
        "predates $VL_FUEL",
      );
      expect(
        "no fuel line, required",
        await agree("no fuel, required", ["--check", "--require-fuel"], {
          STUB_FUEL: "none",
        }, ok),
        1,
        "--require-fuel was given",
      );
      expect(
        "a host before D2336",
        await agree(
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
        await agree("--samples", ["--samples"], {}, ok),
        0,
        "  run 1: control",
      );
      expect(
        "no baseline",
        await agree("no baseline", ["--check"]),
        1,
        "No such file or directory",
      );
      expect(
        "no tail unit",
        await agree(
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
        await agree("no host", ["--check"], { VL: `${dir}/nope` }, ok),
        1,
        "plumb-shape: missing",
      );
      // Disagreement 2: a bad argument.
      const pu = await py(["--bogus"]);
      const vu = await port(["--bogus"]);
      if (pu.code !== 2 || vu.code !== 2 || !vu.out.startsWith("usage:")) {
        throw new Error(
          `a bad argument: want exit 2 from both, got ${pu.code} / ${vu.code}:\n${vu.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
