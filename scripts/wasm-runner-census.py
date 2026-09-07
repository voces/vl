#!/usr/bin/env python3
"""Which test files EXECUTE emitted wasm, by what compile path, for what grade, in which tier.

ROADMAP row 28 asked whether the corpus runner is redundant. The population it quoted was
hand-counted and had already gone stale — it said four standalone suites when there were five
— which is why this is a script. It answers three questions the row conflated:

  * WHICH FILES run emitted wasm at all (an import of `runWasm`/`casesWasmOracle`, or a bare
    `WebAssembly.instantiate`, reached from code rather than named in a comment);
  * BY WHAT PATH each compiles — the in-process seed instance the oracle drives, or a native
    `vl build` subprocess. Two files grade the SAME corpus cells through DIFFERENT paths,
    which is an agreement check and not a duplicate;
  * IN WHICH TIER each runs — `deno task test`'s `tests/` glob, or a named ci-native step.

Run it with no arguments for the table; `--cells` prints the graded-cell SET, which is the
instrument a collapse has to hold fixed (byte identity says nothing here).
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TESTS = os.path.join(ROOT, "tests")
CASES = os.path.join(TESTS, "cases")

# One row per wasm-executing test file, with the two facts a script cannot derive: what the
# suite ASSERTS, and why the corpus oracle cannot assert it. A file that appears in the
# derived population and not here is an error — `tests/vl_wasm_runner_census_test.ts` fails
# until it is classified, so a new runner cannot arrive unnoticed the way the fifth did.
CLASSIFIED = {
    "cases_wasm_0_test.ts": ("oracle shard", "seed (in-process)",
                             "@log output / @trap reason / @hint text"),
    "cases_wasm_1_test.ts": ("oracle shard", "seed (in-process)",
                             "@log output / @trap reason / @hint text"),
    "cases_wasm_2_test.ts": ("oracle shard", "seed (in-process)",
                             "@log output / @trap reason / @hint text"),
    "cases_wasm_3_test.ts": ("oracle shard", "seed (in-process)",
                             "@log output / @trap reason / @hint text"),
    "vl_exported_memory_test.ts": ("standalone", "native vl build",
                                   "host reads instance.exports.memory in place"),
    "vl_global_promotion_test.ts": ("standalone", "native vl build",
                                    "GLOBAL section entry count, + output through the OTHER path"),
    "vl_instance_state_leak_test.ts": ("standalone", "seed (in-process, shared instance)",
                                       "emission byte-identity vs a fresh-instance oracle"),
    "vl_reexport_abi_test.ts": ("standalone", "native vl build",
                                "EXPORT section aliases the public name"),
    "vl_std_process_test.ts": ("standalone", "native vl build",
                               "std:process / std:env across both hosts"),
    "vl_seed_abi_test.ts": ("seed ABI", "none — instantiates the SEED",
                            "the seed's own export shape; not emitted user wasm"),
}


def executing_files():
    """The derived population: files that reach an instantiation of emitted wasm."""
    out = []
    for f in sorted(os.listdir(TESTS)):
        if not f.endswith(".ts"):
            continue
        src = open(os.path.join(TESTS, f), encoding="utf-8").read()
        code = "\n".join(re.sub(r"//.*$", "", l) for l in src.split("\n"))
        oracle = re.search(r'from\s+"\./support/casesWasmOracle\.ts"', code) is not None
        runner = re.search(r'(?:from|import\()\s*"\./support/runWasm\.ts"', code) is not None
        bare = "WebAssembly.instantiate" in code
        if oracle or runner or bare:
            out.append(f)
    return out


def corpus_cells():
    """The oracle's OWN cell set, not a `.vl` glob.

    `casesWasmOracle`'s `walk` yields ONE case for a directory holding an `entry.vl` — the
    whole module — and one per `.vl` otherwise. A glob counts a three-file module as three
    cells and reports a file count wearing a cell count's clothes, which is the number this
    row has to hold fixed across a collapse.
    """
    out = []

    def rec(d):
        if os.path.isfile(os.path.join(d, "entry.vl")):
            out.append(os.path.relpath(d, ROOT) + "/")
            return
        for name in sorted(os.listdir(d)):
            p = os.path.join(d, name)
            if os.path.isdir(p):
                rec(p)
            elif name.endswith(".vl"):
                out.append(os.path.relpath(p, ROOT))

    rec(CASES)
    return sorted(out)


def named_cells(pop):
    """The `tests/cases` paths a wasm-EXECUTING standalone suite names, per file — the cells
    run a second time, by a second path. Not redundancy: `vl_global_promotion` compiles
    through the native `vl build` while the oracle compiles in-process, so the pair is a
    cross-path agreement check. Restricted to `pop` because a file that only CHECKS a cell
    (never instantiating it) is not a second runner of it."""
    hits = {}
    for f in pop:
        if f.startswith("cases_wasm_"):
            continue
        src = open(os.path.join(TESTS, f), encoding="utf-8").read()
        code = "\n".join(re.sub(r"//.*$", "", l) for l in src.split("\n"))
        found = sorted(set(re.findall(r'"(tests/cases/[^"]+\.vl)"', code)))
        # the leak harness names its programs relative to `tests/cases/`
        rel = sorted(set(re.findall(r'path:\s*"([^"]+\.vl)"', code)))
        found += ["tests/cases/" + r for r in rel]
        if found:
            hits[f] = sorted(set(found))
    return hits


def main():
    pop = executing_files()
    if "--cells" in sys.argv:
        cells = corpus_cells()
        print("corpus cells graded by the oracle shards: %d" % len(cells))
        for c in cells:
            print(c)
        return 0

    unclassified = [f for f in pop if f not in CLASSIFIED]
    stale = [f for f in CLASSIFIED if f not in pop]

    print("%-34s %-13s %-32s %s" % ("file", "role", "compile path", "grade"))
    for f in pop:
        role, path, grade = CLASSIFIED.get(f, ("UNCLASSIFIED", "?", "?"))
        print("%-34s %-13s %-32s %s" % (f, role, path, grade))
    print()
    print("files executing wasm: %d" % len(pop))
    for role in ("oracle shard", "standalone", "seed ABI"):
        n = sum(1 for f in pop if CLASSIFIED.get(f, ("", "", ""))[0] == role)
        print("  %-13s %d" % (role, n))
    print()
    print("corpus cells graded by the shards: %d" % len(corpus_cells()))
    named = named_cells(pop)
    total = sum(len(v) for v in named.values())
    print("cells a standalone suite ALSO runs: %d, over %d files" % (total, len(named)))
    for f, cs in named.items():
        print("  %-34s %d" % (f, len(cs)))
    if unclassified:
        print()
        print("UNCLASSIFIED (add a row to CLASSIFIED): %s" % ", ".join(unclassified))
    if stale:
        print()
        print("STALE (classified but no longer executing): %s" % ", ".join(stale))
    return 1 if (unclassified or stale) else 0


if __name__ == "__main__":
    sys.exit(main())
