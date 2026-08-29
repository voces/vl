#!/usr/bin/env python3
"""D451's CURATED cells — the ones the 184-cell d341 grid provably cannot grade.

The d341 grid (scripts/silent-sweep/d341/mkgrid.py) measures the READ position:
23 reps x 4 narrowing constructs x 2 runtime inputs, every cell a guard and a read.
It closed at 0 silent when the emitter's index-place channel landed. What it never
varies is the STATEMENT BETWEEN the guard and the read, and that is where four of
this landing's fourteen rungs live — every one of them scores exactly 0 on all 184
grid cells and three of them are the only thing keeping a `runs` program running:

  R13/R14  the write retirements. `ns[0] = nul()`, `ns[i] = nul()` and `ns = [...]`
           inside the guard each printed `null` on the base compiler and each TRAPPED
           on the candidate until the emitter learned to retire an index-place
           narrowing the way the checker already did. The BOX reps hide this
           completely: their declared rep has no `print` lowering, so the checker
           refuses the read after the write and the emitter is never asked. Only a
           NICHE cell reaches the emitter, and the grid's niche reps never write.
  R8       an un-annotated binding taken FROM a narrowed cell (`const z = xs[0]`).
           The grid always reads the cell directly.
  R9       a value union whose STRING arm is a real box arm (`(string | i32 | null)[]`).
           The grid's `nt_str` is `new string`, which is a nullable-string NICHE — a
           different rep with a different failure — so no grid cell has a boxed string.

Plus two D452 tripwires. D452 is filed as a refinement (`callInvalidatesReal` retires
an index cell for ANY call receiving the array, because the write-effect summaries have
no index vocabulary). These two must keep taking their LOUD check reject; the day the
refinement lands they turn into `runs` with the answers below, which the gate reports.
They are here because the measurement that matters for D452 is not whether the precise
rule is writable but what it BUYS, and that number changed today: with the blunt leg
lifted, both were check-clean INVALID WASM on the base compiler and both run on this
one. D451 was D452's unnamed precondition.

    python3 scripts/silent-sweep/d451/mkcells.py --emit <dir>   write the cells
    python3 scripts/silent-sweep/d451/mkcells.py --mkset        write them into named/
    python3 scripts/silent-sweep/d451/mkcells.py --verify       assert named/ matches
    python3 scripts/silent-sweep/d451/mkcells.py [seed.wasm]    grade to stdout
"""
import json
import os
import subprocess
import sys

R = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))))
NAMED = os.path.join(R, "scripts/silent-sweep/distilled/named")
VL = os.path.join(R, "scripts/vl-host/target/release/vl")

# name -> (source, expected stdout)
CELLS = {
    # ── R8: an un-annotated binding taken from a narrowed cell ────────────────
    "d451_bind_from_cell": ("""type NtI32 = new i32
function src(): NtI32 | null { return 7 }
function body() {
  const xs: (NtI32 | null)[] = [src()]
  if xs[0] != null {
    const z = xs[0]
    print(z)
  } else { print("NUL") }
}
body()
""", "7"),

    # ── R9: a value union whose string arm is a real BOX arm ──────────────────
    "d451_strarm_box_cell": ("""function src(): string | i32 | null { return "aa" }
function body() {
  const xs: (string | i32 | null)[] = [src()]
  if xs[0] is string { print(xs[0]) } else { print("NO") }
}
body()
""", "aa"),

    # ── R13: a write to the narrowed cell itself ──────────────────────────────
    "d451_sound_cell_write": ("""function nul(): string | null { return null }
function body() {
  const ns: (string | null)[] = ["a"]
  if ns[0] != null {
    ns[0] = nul()
    print(ns[0])
  } else { print("NUL") }
}
body()
""", "null"),

    # ── R13/R14: a VARIABLE-index write names no cell, so it kills them all ───
    "d451_sound_varidx_write": ("""function nul(): string | null { return null }
function body() {
  const ns: (string | null)[] = ["a"]
  const i = 0
  if ns[0] != null {
    ns[i] = nul()
    print(ns[0])
  } else { print("NUL") }
}
body()
""", "null"),

    # ── R14: a ROOT rebind replaces every cell ────────────────────────────────
    "d451_sound_root_rebind": ("""function nul(): string | null { return null }
function body() {
  let ns: (string | null)[] = ["a"]
  if ns[0] != null {
    ns = [nul()]
    print(ns[0])
  } else { print("NUL") }
}
body()
""", "null"),

    # ── the OTHER direction: a write the narrowing ADMITS must keep it ────────
    # Base is check-clean invalid wasm here too — this cell is bought, not priced.
    "d451_admitted_write": ("""function take(v: string) { print(v) }
function body() {
  const ns: (string | null)[] = ["a"]
  if ns[0] != null {
    ns[0] = "z"
    take(ns[0])
  } else { print("NUL") }
}
body()
""", "z"),

    # ── both runtime inputs of the niche cell, in one program ─────────────────
    "d451_niche_both_inputs": ("""function nul(): string | null { return null }
function body() {
  const ns: (string | null)[] = [nul()]
  if ns[0] != null { print(ns[0]) } else { print("NUL") }
  const ms: (string | null)[] = ["a"]
  if ms[0] != null { print(ms[0]) } else { print("NUL") }
}
body()
""", "NUL\na"),

    # ── D452 tripwires: LOUD today, and these are the answers if it lands ─────
    "d452_alias_box_cell": ("""type NtI32 = new i32
function src(): NtI32 | null { return 7 }
function look(ys: (NtI32 | null)[]) { print(ys.length) }
function body() {
  const xs: (NtI32 | null)[] = [src()]
  if xs[0] != null {
    look(xs)
    print(xs[0])
  } else { print(0) }
}
body()
""", "1\n7"),

    "d452_alias_arr3_cell": ("""function src(): i32[][][] | null { return [[[1, 2]]] }
function look(ys: (i32[][][] | null)[]) { print(ys.length) }
function body() {
  const xs: (i32[][][] | null)[] = [src()]
  if xs[0] != null {
    look(xs)
    print(xs[0][0][0][1])
  } else { print(0) }
}
body()
""", "1\n2"),
}


def emit(d):
    os.makedirs(d, exist_ok=True)
    for n, (src, _) in sorted(CELLS.items()):
        open(os.path.join(d, n + ".vl"), "w").write(src)
    man = {"block": "d451-emitter-index-channel",
           "expect": {n: e for n, (_, e) in CELLS.items()},
           "generated": len(CELLS)}
    json.dump(man, open(os.path.join(d, "manifest.json"), "w"),
              indent=1, sort_keys=True)
    print("wrote %d cells to %s" % (len(CELLS), d))
    return 0


def mkset():
    for n, (src, _) in sorted(CELLS.items()):
        open(os.path.join(NAMED, n + ".vl"), "w").write(src)
    print("wrote %d cells into %s" % (len(CELLS), NAMED))
    print("now add their `expect` entries to named/manifest.json and re-baseline")
    return 0


def verify():
    checked = bad = missing = 0
    for n, (src, _) in sorted(CELLS.items()):
        ref = os.path.join(NAMED, n + ".vl")
        if not os.path.exists(ref):
            missing += 1
            print("MISSING FROM named/: %s" % n)
            continue
        checked += 1
        if open(ref).read() != src:
            bad += 1
            print("DIFFERS FROM named/: %s" % n)
    man = json.load(open(os.path.join(NAMED, "manifest.json")))
    noexp = [n for n in CELLS if n not in man["expect"]]
    for n in noexp:
        print("NO EXPECTATION IN named/manifest.json: %s" % n)
    wrongexp = [n for n, (_, e) in CELLS.items()
                if n in man["expect"] and man["expect"][n] != e]
    for n in wrongexp:
        print("EXPECTATION DIFFERS: %s (set %r, named/ %r)"
              % (n, CELLS[n][1], man["expect"][n]))
    print("verify: %d of %d cells present in named/, %d differ, %d missing, "
          "%d without an expectation, %d with a different one"
          % (checked, len(CELLS), bad, missing, len(noexp), len(wrongexp)))
    return 1 if (bad or missing or noexp or wrongexp) else 0


def grade(seed):
    import tempfile
    with tempfile.TemporaryDirectory() as d:
        for n, (src, want) in sorted(CELLS.items()):
            p = os.path.join(d, n + ".vl")
            open(p, "w").write(src)
            r = subprocess.run([VL, "run", p, "--compiler", seed],
                               capture_output=True, text=True, cwd=R,
                               env=dict(os.environ,
                                        VL_STD=os.path.join(R, "std")))
            o = (r.stdout + r.stderr)
            if r.returncode == 0:
                v = "runs" if r.stdout.strip() == want else \
                    "runs but WRONG VALUE (%r)" % r.stdout.strip()
            elif "Invalid input WebAssembly" in o:
                v = "check-clean invalid wasm"
            elif "wasm trap" in o:
                v = "trap_loads"
            elif "emit error" in o:
                v = "loud emit reject"
            else:
                v = "loud check reject"
            print("%-26s %s" % (n, v))
    return 0


def main():
    a = sys.argv[1:]
    if a and a[0] == "--emit":
        return emit(a[1])
    if a and a[0] == "--mkset":
        return mkset()
    if a and a[0] == "--verify":
        return verify()
    return grade(a[0] if a else os.path.join(R, "build/vl-compiler.wasm"))


sys.exit(main())
