#!/usr/bin/env python3
"""Whose loop is it? Rank the immediate PARENT frame of every sample whose leaf
is FUNC, and print FUNC's own self/incl share.

    scripts/perf/profile-parents.py <profile.json> <func> [top]

`__str_eq__` at the top of a profile is a symptom, not a site: it is the
name-keyed registries doing linear lookups. This attributes those samples to the
registry that asked. With no FUNC it prints every frame's self/incl instead, so a
function too small for `profile-rank.py`'s top-N can still be looked up.
"""
import collections
import json
import sys


def load(path):
    prof = json.load(open(path))
    th = prof["threads"][0]
    strings = th.get("stringArray") or th.get("stringTable") or prof.get(
        "shared", {}).get("stringArray", [])
    ff, fn = th["frameTable"]["func"], th["funcTable"]["name"]
    pre, fr = th["stackTable"]["prefix"], th["stackTable"]["frame"]
    return th, (lambda s: strings[fn[ff[fr[s]]]]), pre


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    th, name, prefix = load(argv[1])
    func = argv[2] if len(argv) > 2 else None
    top = int(argv[3]) if len(argv) > 3 else 20
    samples = [s for s in th["samples"]["stack"] if s is not None and s >= 0]
    total = len(samples)
    if not func:
        self_t = collections.Counter(name(s) for s in samples)
        print(f"{total} samples")
        for nm, n in self_t.most_common(top):
            print(f"{100.0 * n / total:7.2f}  {nm}")
        return 0
    par: collections.Counter[str] = collections.Counter()
    hits = 0
    for s in samples:
        if name(s) != func:
            continue
        hits += 1
        p = prefix[s]
        par[name(p) if p is not None and p >= 0 else "<root>"] += 1
    print(f"{total} samples; {func} is the leaf of {hits} "
          f"({100.0 * hits / total:.2f}% self)")
    print(f"{'of-total':>9} {'of-func':>8}  immediate caller")
    for nm, n in par.most_common(top):
        print(f"{100.0 * n / total:9.2f} {100.0 * n / hits:8.1f}  {nm}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
