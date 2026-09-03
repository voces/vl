#!/usr/bin/env python3
"""
Make every losslessness check in `split.py` FIRE, on a specimen whose fault is known by
construction. Run it: `python3 scripts/inventory/selftest.py`.

WHY THIS EXISTS. A check that has never been seen to distinguish two answers is not known
to distinguish them — the discipline `check-filed-witnesses.py --self-test` and
`silent-sweep/sabotage.py` already apply to their graders. It caught a real one here: the
first `--verify` had a "separator region carries text" check computed FROM the same
function that produced the files, so it could not fail whatever the input. Replacing it
with the prefix check below is what made a truncated row detectable.

Each case states its expectation in source, ahead of the run. No writes outside a temp dir.
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rows as R  # noqa: E402
import split as S  # noqa: E402

CASES = []


def specimen():
    """Inventory #2's text — small, and the same grammar as #1. Rejoined from the split
    directory once the monolith is a pointer, so this keeps working after the split lands."""
    src, d = S.SOURCES[1]
    p = S.Plan(src, d)
    if p.rowblocks:
        return p.text
    files = R.row_files(d)
    return S.SEP.join(f.read_text().rstrip("\n") for f in files) + "\n"


def case(name, want_faults):
    def deco(fn):
        CASES.append((name, want_faults, fn))
        return fn
    return deco


def written(src, d):
    """The plan, written to `d` exactly as `--apply` writes it."""
    d.mkdir(parents=True, exist_ok=True)
    plan = S.Plan(src, d)
    for rid, body in plan.files.items():
        (d / f"{rid}.md").write_text(body)
    return plan


@case("pristine, from the plan", 0)
def _(src, d):
    pass


@case("pristine, from disk", 0)
def _(src, d):
    written(src, d)


@case("two rows claim one id", 1)
def _(src, d):
    src.write_text(src.read_text().replace("### D452 — ", "### D451 — ", 1))


@case("a row file TRUNCATED on disk", 1)
def _(src, d):
    written(src, d)
    body = (d / "D5.md").read_text().split("\n")
    (d / "D5.md").write_text("\n".join(body[:len(body) // 2]) + "\n")


@case("a row file EDITED on disk", 1)
def _(src, d):
    written(src, d)
    (d / "D5.md").write_text((d / "D5.md").read_text().replace("  ", " ", 3))


@case("a row file REMOVED from disk", 1)
def _(src, d):
    written(src, d)
    (d / "D9.md").unlink()


@case("a stray file claiming an id no row has", 1)
def _(src, d):
    written(src, d)
    (d / "D9999.md").write_text("### D9999 — invented\n**closed**\n\n    print(1)\n")


@case("a parser that loses one line", 1)
def _(src, d):
    real = R.parse_blocks

    def lossy(text):
        bs = real(text)
        bs[-1].text = "\n".join(bs[-1].text.split("\n")[1:])
        return bs
    R.parse_blocks = lossy


def main():
    bad, text = 0, specimen()
    for name, want, fn in CASES:
        real = R.parse_blocks
        with tempfile.TemporaryDirectory() as td:
            src, d = Path(td) / "inv.md", Path(td) / "inv"
            src.write_text(text)
            fn(src, d)
            plan = S.Plan(src, d)
            faults = plan.check(from_disk=bool(R.row_files(d)))
            R.parse_blocks = real
        got = 1 if faults else 0
        ok = got == want
        bad += 0 if ok else 1
        print(f"  {name:40s} want {want}  got {got}  {'ok' if ok else '** WRONG **'}")
        if faults:
            first = faults[0]
            print(f"      {first[0]}: {first[1].splitlines()[0][:88]}")
    print(f"{len(CASES)} specimens · {len(CASES) - bad} routed correctly · {bad} wrong")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
