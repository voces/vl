#!/usr/bin/env python3
"""Rank a `VL_PROFILE_GUEST` Firefox-profiler JSON by function SELF time.

    VL_PROFILE_GUEST=/tmp/p.json vl build compiler/entry.vl \
        -o /tmp/out.wasm --compiler <a seed built with --names>
    python3 scripts/profile-rank.py /tmp/p.json

The host samples the guest every ~1 ms (see `compile_vl_guest_profiled` in
scripts/vl-host/src/main.rs) and writes one thread of stack samples. A frame's
SELF time is the samples whose LEAF is that frame; INCL is the samples with the
frame anywhere on the stack, counted once per sample so recursion cannot
double-count.  Without a `--names` seed every frame reads `wasm-function[N]`.
"""
import collections
import json
import sys


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    top = int(argv[2]) if len(argv) > 2 else 20
    with open(argv[1]) as fh:
        prof = json.load(fh)

    th = prof["threads"][0]
    strings = th.get("stringArray") or th.get("stringTable") or prof.get("shared", {}).get(
        "stringArray", []
    )
    frame_func = th["frameTable"]["func"]
    func_name = th["funcTable"]["name"]
    st_prefix = th["stackTable"]["prefix"]
    st_frame = th["stackTable"]["frame"]

    def name_of_stack(s: int) -> str:
        return strings[func_name[frame_func[st_frame[s]]]]

    self_t: collections.Counter[str] = collections.Counter()
    incl_t: collections.Counter[str] = collections.Counter()
    total = 0
    # Walking a stack to its root is O(depth); memoise the ancestor NAME SET per
    # stack node so a deep compiler stack is walked once, not once per sample.
    ancestors: dict[int, frozenset[str]] = {}

    def anc(s: int) -> frozenset[str]:
        chain = []
        cur = s
        while cur is not None and cur >= 0 and cur not in ancestors:
            chain.append(cur)
            cur = st_prefix[cur]
        acc = ancestors.get(cur, frozenset()) if cur is not None and cur >= 0 else frozenset()
        for node in reversed(chain):
            acc = acc | {name_of_stack(node)}
            ancestors[node] = acc
        return ancestors[s]

    for s in th["samples"]["stack"]:
        if s is None or s < 0:
            continue
        total += 1
        self_t[name_of_stack(s)] += 1
        for nm in anc(s):
            incl_t[nm] += 1

    print(f"{total} samples")
    print(f"{'self%':>7} {'incl%':>7}  function")
    for nm, n in self_t.most_common(top):
        print(f"{100.0 * n / total:7.2f} {100.0 * incl_t[nm] / total:7.2f}  {nm}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
