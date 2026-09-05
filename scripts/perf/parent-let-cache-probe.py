#!/usr/bin/env python3
"""How well does `parentLetOf`'s single-entry block cache serve a self-compile?

A profile says how much time `plScanStmt` costs; it cannot say whether a BIGGER cache
would avoid the rebuild. This counts, over one self-compile: every ask, every rebuild,
every arena node the rebuilds visit, how many rebuilds an LRU ring of 2/4/8/16/32/128
blocks would avoid, and how many an UNBOUNDED per-block cache would avoid. The gap
between the ring columns and the unbounded one is the reuse distance, which is what
decides whether a ring is the fix.

    python3 scripts/perf/parent-let-cache-probe.py

Method: patch temporary counters into `compiler/emit_base.vl`, report them through
`emitFail` at the foot of `emitProgram` (the compiler module is instantiated with an
EMPTY linker, so `print` has no import to reach), build that compiler to a scratch path,
then compile the compiler with it. The patch is reverted before the measuring build runs,
so a poisoned seed cannot outlive the script; `build/vl-compiler.wasm` is never written.

The revert restores the BYTES this script read before patching, never `git checkout --`:
the working tree it runs in is not one it created, and a checkout there discards whatever
uncommitted edit the caller was measuring. That cost one session its whole change, and the
green gate that followed was master's.

Anchors are exact source strings and a missing one is a loud failure, not a silent
no-op probe.
"""
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = ROOT / "compiler/emit_base.vl"
SECT = ROOT / "compiler/emit_sections.vl"
VL = ROOT / "scripts/vl-host/target/release/vl"

COUNTERS = '''
let plAsks: i32 = 0
let plBuilds: i32 = 0
let plScanNodes: i32 = 0
let plSeen: i32[] = []
let plHitInf: i32 = 0
let plRingK: i32[] = [2, 4, 8, 16, 32, 128]
let plRings: i32[][] = [[], [], [], [], [], []]
let plHits: i32[] = [0, 0, 0, 0, 0, 0]

function plRingStep(ring: i32[], k: i32, blockIx: i32): i32 {
  let i = 0
  while i < ring.length {
    if ring[i] == blockIx {
      let j = i
      while j > 0 {
        ring[j] = ring[j - 1]
        j = j - 1
      }
      ring[0] = blockIx
      return 1
    }
    i = i + 1
  }
  ring.push(0)
  let j2 = ring.length - 1
  while j2 > 0 {
    ring[j2] = ring[j2 - 1]
    j2 = j2 - 1
  }
  ring[0] = blockIx
  while ring.length > k { ring.pop() }
  0
}

function plProbe(blockIx: i32) {
  plAsks = plAsks + 1
  let r = 0
  while r < plRingK.length {
    if plRingStep(plRings[r], plRingK[r], blockIx) > 0 { plHits[r] = plHits[r] + 1 }
    r = r + 1
  }
  while plSeen.length <= blockIx { plSeen.push(0) }
  if plSeen[blockIx] > 0 { plHitInf = plHitInf + 1 }
  plSeen[blockIx] = 1
  0
}

function plDigit(d: i32): string {
  if d == 0 { return "0" }
  if d == 1 { return "1" }
  if d == 2 { return "2" }
  if d == 3 { return "3" }
  if d == 4 { return "4" }
  if d == 5 { return "5" }
  if d == 6 { return "6" }
  if d == 7 { return "7" }
  if d == 8 { return "8" }
  "9"
}

function plDec(n: i32): string {
  if n == 0 { return "0" }
  let s = ""
  let v = n
  while v > 0 {
    s = plDigit(v % 10) + s
    v = v / 10
  }
  s
}

export function plStatsMsg(): string {
  let hits = ""
  let r = 0
  while r < plRingK.length {
    hits = hits + " ring" + plDec(plRingK[r]) + "=" + plDec(plHits[r])
    r = r + 1
  }
  (
    "PLSTATS asks=" + plDec(plAsks) + " builds=" + plDec(plBuilds) + " scanNodes=" +
      plDec(plScanNodes) + " hitInf=" + plDec(plHitInf) + hits
  )
}
'''

EDITS = [
    (
        BASE,
        "function plBuildLetMap(blockIx: i32) { plScanStmt(blockIx) }",
        "function plBuildLetMap(blockIx: i32) {\n  plBuilds = plBuilds + 1\n"
        "  plScanStmt(blockIx)\n}\n" + COUNTERS,
    ),
    (
        BASE,
        "function plScanStmt(ix: i32) {\n  if ix < 0 { return 0 }\n",
        "function plScanStmt(ix: i32) {\n  if ix < 0 { return 0 }\n"
        "  plScanNodes = plScanNodes + 1\n",
    ),
    (
        BASE,
        "export function parentLetOfSid(blockIx: i32, sid: i32) {\n"
        "  if blockIx < 0 { return -1 }\n",
        "export function parentLetOfSid(blockIx: i32, sid: i32) {\n"
        "  if blockIx < 0 { return -1 }\n  plProbe(blockIx)\n",
    ),
    (
        BASE,
        "function parentLoopVarOfSid(blockIx: i32, sid: i32) {\n"
        "  if blockIx < 0 { return -1 }\n",
        "function parentLoopVarOfSid(blockIx: i32, sid: i32) {\n"
        "  if blockIx < 0 { return -1 }\n  plProbe(blockIx)\n",
    ),
    (SECT, "  nulCloFlag,\n", "  nulCloFlag,\n  plStatsMsg,\n"),
    (
        SECT,
        "    const rc = emitModule(stmts)\n    if rc < 0 { return rc }\n",
        "    const rc = emitModule(stmts)\n    if rc < 0 { return rc }\n"
        "    emitFail(plStatsMsg())\n",
    ),
]


# The bytes each patched file held before `patch` touched it, which is what `revert`
# puts back. Filled by `patch` and read by `revert`, so the two cannot disagree about
# which files were edited.
SAVED: dict[pathlib.Path, str] = {}


def patch() -> None:
    """Apply every edit, failing loudly on an anchor that no longer matches."""
    texts: dict[pathlib.Path, str] = {}
    for path, old, new in EDITS:
        if path not in SAVED:
            SAVED[path] = path.read_text()
        s = texts.get(path) or SAVED[path]
        if s.count(old) != 1:
            raise SystemExit(
                f"anchor not unique in {path.name} ({s.count(old)} matches) — the probe "
                f"is stale against this source:\n{old}"
            )
        texts[path] = s.replace(old, new, 1)
    for path, s in texts.items():
        path.write_text(s)


def revert() -> None:
    """Put back the bytes `patch` read. Never `git checkout --`: an uncommitted edit in
    the tree this runs in is the caller's, and a checkout would take it with the patch."""
    for path, s in SAVED.items():
        path.write_text(s)


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=900, **kw)


def main() -> int:
    if not VL.exists():
        print(f"missing vl binary: {VL}", file=sys.stderr)
        return 1
    seed = ROOT / "build/vl-compiler.wasm"
    if not seed.exists():
        print("missing seed: run scripts/refresh-compiler.sh", file=sys.stderr)
        return 1
    with tempfile.TemporaryDirectory() as tmp:
        probe = f"{tmp}/probe.wasm"
        patch()
        try:
            # The seed builds the PROBE compiler; `-o` keeps it out of `build/`, so the
            # instrumented bytes can never become anyone's seed.
            b = run([str(VL), "build", "compiler/entry.vl", "-o", probe,
                     "--compiler", str(seed)])
        finally:
            revert()
        if b.returncode != 0:
            print(b.stdout + b.stderr, file=sys.stderr)
            return 1
        # The probe compiler compiles the (now pristine) compiler; `VL_STD` because the
        # host resolves `std:` from the BINARY's checkout, not this one.
        m = run([str(VL), "build", "compiler/entry.vl", "-o", f"{tmp}/out.wasm",
                 "--compiler", probe], env={**__import__("os").environ,
                                            "VL_STD": str(ROOT / "std")})
    line = next((l for l in (m.stdout + m.stderr).splitlines() if "PLSTATS" in l), "")
    if not line:
        print("the probe did not report — is `emitFail` still the foot of emitProgram?",
              file=sys.stderr)
        print(m.stdout + m.stderr, file=sys.stderr)
        return 1
    f = dict(re.findall(r"(\w+)=(\d+)", line))
    asks, builds = int(f["asks"]), int(f["builds"])
    print(f"asks                        {asks:>12,}")
    print(f"served by the one-slot cache{asks - builds:>12,}  ({100.0 * (asks - builds) / asks:.2f}%)")
    print(f"rebuilds                    {builds:>12,}")
    print(f"arena nodes rebuilding      {int(f['scanNodes']):>12,}")
    print(f"distinct blocks asked       {asks - int(f['hitInf']):>12,}")
    print()
    print(f"{'cache':>10}  {'rebuilds avoided':>16}  {'of all rebuilds':>15}")
    for k in (2, 4, 8, 16, 32, 128):
        saved = int(f[f"ring{k}"]) - (asks - builds)
        print(f"{f'LRU {k}':>10}  {saved:>16,}  {100.0 * saved / builds:>14.2f}%")
    inf = int(f["hitInf"]) - (asks - builds)
    print(f"{'unbounded':>10}  {inf:>16,}  {100.0 * inf / builds:>14.2f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
