#!/usr/bin/env python3
"""Attribute a `VL_PROFILE_GUEST` profile to the module pipeline's PHASES.

    scripts/perf/guest-profile.sh /tmp/p build compiler/entry.vl
    python3 scripts/perf/profile-phases.py /tmp/p/entry.json

`profile-rank.py` ranks FUNCTIONS; this ranks the driver's stages. Each sample is
walked from the ROOT down and charged to the first frame naming a phase entry point,
so a phase's number is inclusive of everything it calls and the phases partition the
run. That is what separates the per-module half of a check (scan, lex, parse, rename)
from the merged half (`checkProgram` over every module's statements at once) — the
split item #9 turns on. `vl check` cannot be profiled (the guest profiler hooks
`compile_vl`, which `check` does not take), so profile a `build` and read the
check-side column: every phase but `emitProgram` is shared with a check.
"""
import collections
import json
import re
import sys

# root-down, first match wins; the stack decides, not the order here
PHASES = [
    ("stage: modScan (import/export scan)", {"modScan"}),
    ("stage: modCommit / modSrcLoad (host fetch)", {"modCommit", "modCommitStr", "modSrcLoad", "modKeyLoad"}),
    ("1 order+validate (modVisit)", {"modVisit"}),
    ("2 lex per module (vcLoadToksMod)", {"vcLoadToksMod", "vcLoadToks"}),
    ("2 parse per module (parseProgram)", {"parseProgram"}),
    ("2b dup / builtin-decl screens", {"modCheckDupBindings", "modCheckBuiltinTyDecls"}),
    ("3+4 rename + rewrite per module", {
        "modCollectSelfFns", "modBuildRename", "modBankUfcsScope", "ufcsModBoundAdd",
        "modRwStmt", "modRwDeclBase",
    }),
    ("4b/4c export alias tables", {"modMergedTargetOf"}),
    ("5 csPreMintLocs (MERGED)", {"csPreMintLocs"}),
    ("5 checkProgram (MERGED)", {"checkProgram"}),
    ("5 jwSecondPass (MERGED)", {"jwSecondPass"}),
    ("6 emitProgram (MERGED, build only)", {"emitProgram"}),
]
NAME_TO_PHASE = {n: label for label, names in PHASES for n in names}
UNCLAIMED = "(outside every named phase)"
EMIT = "6 emitProgram (MERGED, build only)"


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
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

    def name_of(s: int) -> str:
        # a merged module's functions carry the `$mN` suffix the rename pass gave them
        return re.sub(r"\$m\d+$", "", strings[func_name[frame_func[st_frame[s]]]])

    memo: dict[int, str | None] = {}

    def phase_of(s: int) -> str | None:
        chain = []
        cur = s
        while cur is not None and cur >= 0 and cur not in memo:
            chain.append(cur)
            cur = st_prefix[cur]
        acc = memo.get(cur) if (cur is not None and cur >= 0) else None
        for node in reversed(chain):
            memo[node] = acc if acc is not None else NAME_TO_PHASE.get(name_of(node))
            acc = memo[node]
        return memo[s]

    counts: collections.Counter[str] = collections.Counter()
    total = 0
    for s in th["samples"]["stack"]:
        if s is None or s < 0:
            continue
        total += 1
        counts[phase_of(s) or UNCLAIMED] += 1
    if total == 0:
        print("no samples", file=sys.stderr)
        return 1

    order = [lbl for lbl, _ in PHASES] + [UNCLAIMED]
    check = total - counts[EMIT]
    print(f"samples {total}; check side (everything but emitProgram) {check}")
    print("| phase | samples | % of run | % of the check side |")
    print("| --- | ---: | ---: | ---: |")
    for lbl in order:
        if counts[lbl] == 0:
            continue
        side = "—" if lbl == EMIT else f"{100.0 * counts[lbl] / check:.1f}%"
        print(f"| {lbl} | {counts[lbl]} | {100.0 * counts[lbl] / total:.2f}% | {side} |")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
