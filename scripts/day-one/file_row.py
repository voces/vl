#!/usr/bin/env python3
"""Turn a minimised day-one hit into an inventory ROW DRAFT and a standing PROBE.

    python3 scripts/day-one/file_row.py run.jsonl --index 7 --title "…"
    python3 scripts/day-one/file_row.py run.jsonl --index 7 --probe-name uncalled-hof

The row is `docs/internals/inventory/D<next>.md` from `TEMPLATE.md`, and it carries the
GENERATOR SEED AND INDEX so the witness is reproducible verbatim rather than by memory —
`sample.py --seed N` regenerates the identical pair. The probe is
`scripts/capability-probes/<name>.vl` in that directory's own format, so the moment the
row is filed the gap is on the standing instrument and stops depending on this sampler
being re-run.

IT DRAFTS; IT DOES NOT FILE. Read the row, replace the mechanism paragraph with what the
ABLATION says, and check the inventory for the SHAPE (not the message — five closed rows
share D1473's sentence and none reaches its witness) before committing.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)

import minimise as M  # noqa: E402
import sample as S  # noqa: E402

INV = os.path.join(ROOT, "docs", "internals", "inventory")
PROBES = os.path.join(ROOT, "scripts", "capability-probes")

ROW = """### {rid} — {title}

**{status} · `vl check` rc {chkrc} · clause {clause} · the {face} spelling only; the \
{twinface} spelling RUNS · found {date} by `scripts/day-one/sample.py --seed {seed}` \
pair {index} (axis `{axis}`), against master `{sha}`**

Repro:

{repro}

#### Mechanism

TODO — what decides the outcome, and where. A validator sentence is not a mechanism;
write what the ABLATION below says, not what the message says.

#### Ablation

| ingredient removed | outcome | needed? |
| --- | --- | --- |
{ablation}

#### Grading list

* the twin spelling below, which must keep running:

{twin}
"""

PROBE = """// {title}
//
// Found by the day-one sampler (`scripts/day-one/sample.py --seed {seed}`, pair {index},
// axis `{axis}`). The TWIN spelling — {twinface} — runs and prints the same value, which is
// what makes this a capability gap rather than a design question. See {rid}.
// Should print {want}.
{src}"""


def next_id():
    out = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "inventory",
                                                       "ls.py"), "--next"],
                         capture_output=True, text=True)
    return out.stdout.strip().split()[-1]


def sha():
    out = subprocess.run(["git", "-C", ROOT, "rev-parse", "--short", "HEAD"],
                         capture_output=True, text=True)
    return out.stdout.strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jsonl")
    ap.add_argument("--index", type=int, required=True)
    ap.add_argument("--title", default="TODO one sentence naming the MECHANISM")
    ap.add_argument("--probe-name")
    ap.add_argument("--compiler", default=S.SEED)
    ap.add_argument("--date", default=None)
    ap.add_argument("--write", action="store_true", help="write the files, not stdout")
    a = ap.parse_args()

    pairs = [json.loads(l) for l in open(a.jsonl, encoding="utf-8") if l.strip()]
    pair = next(p for p in pairs if p["index"] == a.index)
    side = "a" if pair["a"]["grade"] != "RUNS" else "b"
    twin = "b" if side == "a" else "a"

    with tempfile.TemporaryDirectory(prefix="vl-day-one-file-") as td:
        wit, base = M.minimise(pair[side]["src"], pair[side]["want"], a.compiler, td)
        _, rows = M.ablate(pair, side, a.compiler, td)

    status = {"emit refuses": "loud emit reject",
              "check refuses": "loud check reject",
              "SILENT (check rc 0)": "check-clean invalid wasm",
              "RUNS-WRONG": "check-clean silently wrong",
              "TRAP (program)": "loads then traps",
              "COMPILER TRAP (check rc 0)": "compiler trap"}.get(base["grade"],
                                                                 base["grade"])
    rid = next_id()
    import datetime
    body = ROW.format(
        rid=rid, title=a.title, status=status,
        chkrc="0" if base["grade"] != "check refuses" else "non-zero",
        clause="1" if base["grade"] in ("SILENT (check rc 0)", "RUNS-WRONG") else "2",
        face=pair[side]["face"], twinface=pair[twin]["face"],
        date=a.date or datetime.date.today().isoformat(),
        seed=pair["seed"], index=pair["index"], axis=pair["axis"], sha=sha(),
        repro="\n".join("    " + l for l in wit.rstrip().split("\n")) +
        "\n    // vl check: rc 0.  vl run: " + base["message"][:80],
        ablation="\n".join("| %s %s | %s | %s |" % (ax, flip, grade,
                                                    "**yes**" if same == "MOVED"
                                                    else "no")
                           for ax, flip, grade, same in rows) or "| — | — | — |",
        twin="\n".join("    " + l for l in pair[twin]["src"].rstrip().split("\n")))

    probe = PROBE.format(title=a.title, seed=pair["seed"], index=pair["index"],
                         axis=pair["axis"], twinface=pair[twin]["face"], rid=rid,
                         want=" then ".join(pair[side]["want"]), src=wit)

    if not a.write:
        print(body)
        print("---- probe ----")
        print(probe)
        return 0
    rowpath = os.path.join(INV, rid + ".md")
    open(rowpath, "w", encoding="utf-8").write(body)
    print("wrote " + rowpath)
    if a.probe_name:
        pp = os.path.join(PROBES, a.probe_name + ".vl")
        open(pp, "w", encoding="utf-8").write(probe)
        print("wrote " + pp)
    return 0


if __name__ == "__main__":
    sys.exit(main())
