#!/usr/bin/env python3
"""The shared ratchet core — one baseline schema, one `--check`, one `--why`.

Five scripts hold a count against a committed baseline that may only FALL:
comment-budget, ladder-budget, sentinel-budget, scan-budget and seed-size. The
four that count PER FILE PER CODE were the same 41 lines four times over —
`load_baseline`, `write_baseline`, `cmd_check`, `cmd_exempt_codes`, the
`{file: {code: count}}` schema, the `git archive` tree walk, and the
`python3 scripts/<self>.py --write-baseline` remedy line. This is that shape,
once; each script keeps its own census and its own words.

WHAT A FRONT END SUPPLIES: a `current()` returning `{file: {code: count}}`, the
sentence `--check` prints when nothing regressed, the paragraph it prints when
something did, the fields its baseline carries besides `total`/`files`, and —
where its census can name a hit — a `named(root)` returning `{code: {name: hits}}`
so `--why` can say what LEFT rather than only that the number fell. CLAUDE.md
asks for `--why` on every ratchet with a baseline; a scalar ratchet (seed-size)
has no entries to name and takes only `ROOT` and `head_commit` from here.

WHY `named` IS HITS PER NAME AND NOT A SET: one function commonly carries several
hits (a different table or subject each), so a name that keeps its place while its
count falls is a function that fixed one of two — which a set would show as no
movement at all.

WHICH TREE A FALL IS MEASURED AGAINST: the baseline's own `commit` field, else the
commit that last CHANGED the baseline file, else nothing — and then `--why` names
the fix rather than guessing.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The identifier alphabet the VL-source scanners share. A byte is a character
# here because sources are read latin-1 (see `read_source`).
WORD = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")
DIGIT = set("0123456789")


def read_source(path):
    """Latin-1 so one index is one BYTE, matching the lint's `s[i]`."""
    with open(path, "rb") as fh:
        return fh.read().decode("latin-1")


def sources(dirs, root=None):
    """`(relative name, absolute path)` for every `.vl` under `dirs`, sorted.

    `root` defaults to this checkout; `--why` passes the temp tree an archive was
    unpacked into, so both sides of a comparison are walked by the same code."""
    base = root or ROOT
    for d in dirs:
        p = os.path.join(base, d)
        for name in sorted(os.listdir(p)):
            if name.endswith(".vl"):
                yield f"{d}/{name}", os.path.join(p, name)


def head_commit(default=""):
    """The short sha of the tree a baseline is being written from — provenance for
    a human reading a fall, never an input to `--check`. `default` outside a
    checkout, or when git cannot answer."""
    try:
        out = subprocess.run(
            ["git", "-C", ROOT, "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=10,
        )
        return out.stdout.strip() if out.returncode == 0 else default
    except (OSError, subprocess.SubprocessError):
        return default


def flag_value(args, flag, default=""):
    """The argument after `flag`, or `default` when it is the last one."""
    i = args.index(flag) + 1
    return args[i] if len(args) > i else default


def tree_at(commit, stem, paths=("compiler",)):
    """`paths` as of `commit`, unpacked into a temp directory by `archive | tar -x`
    and NEVER by a checkout: this runs beside a working tree somebody is editing,
    and a checkout would move their files under them. The caller removes it."""
    tmp = tempfile.mkdtemp(prefix=f"{stem}-")
    try:
        arch = subprocess.run(["git", "-C", ROOT, "archive", commit, *paths],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if arch.returncode != 0:
            raise SystemExit(f"{stem}: `archive {commit}` failed: "
                             + arch.stderr.decode(errors="replace").strip())
        tar = subprocess.run(["tar", "-x", "-C", tmp], input=arch.stdout,
                             stderr=subprocess.PIPE)
        if tar.returncode != 0:
            raise SystemExit(f"{stem}: could not unpack the archive: "
                             + tar.stderr.decode(errors="replace").strip())
        return tmp
    except BaseException:
        shutil.rmtree(tmp, ignore_errors=True)
        raise


class Ratchet:
    """One per-file ratchet: the baseline, the codes, and the four commands.

    `ok_line` and `wrote_line` take the totals dict and return the script's own
    sentence; `remedy` is the paragraph `--check` prints above the shared
    `--write-baseline` line. `extras` returns the `(key, value)` pairs its
    baseline carries before `total`. `named` is optional — without it the ratchet
    has no `--why` and `--check` offers none."""

    def __init__(self, script, label, baseline, codes, ok_line, remedy,
                 wrote_line, extras=None, named=None, tree_paths=("compiler",)):
        self.script = script
        self.label = label
        self.baseline = baseline
        self.codes = tuple(codes)
        self.ok_line = ok_line
        self.remedy = remedy
        self.wrote_line = wrote_line
        self.extras = extras or (lambda: ())
        self.named = named
        self.tree_paths = tree_paths

    @property
    def stem(self):
        """The name this script answers to in its own messages."""
        return self.script.removesuffix(".py")

    def totals(self, cur):
        return {c: sum(v.get(c, 0) for v in cur.values()) for c in self.codes}

    def load_baseline(self):
        with open(self.baseline, encoding="utf-8") as fh:
            return json.load(fh)

    def write_baseline(self, cur):
        total = self.totals(cur)
        rows = [f'{json.dumps(k)}: {json.dumps(v)}' for k, v in sorted(cur.items())]
        body = ["{"]
        body += [f'{json.dumps(k)}: {json.dumps(v)},' for k, v in self.extras()]
        body += [
            f'"total": {json.dumps(total)},',
            '"files": {',
            ",\n".join(rows),
            "}",
            "}",
        ]
        with open(self.baseline, "w", encoding="utf-8") as fh:
            fh.write("\n".join(body) + "\n")
        print(f"wrote {self.baseline}: {self.wrote_line(total)}")
        return 0

    def check(self, cur):
        base = self.load_baseline()["files"]
        bad = []
        for rel, v in sorted(cur.items()):
            b = base.get(rel, {})
            for c in self.codes:
                if v.get(c, 0) > b.get(c, 0):
                    bad.append(f"  {rel}  {c}: {v.get(c, 0)} (baseline {b.get(c, 0)})")
        if bad:
            print(f"{self.label} budget REGRESSED — a file may only go down or stay:")
            print("\n".join(bad))
            print("\n" + self.remedy
                  + f"\n  python3 scripts/{self.script} --write-baseline")
            return 1
        tot = self.totals(cur)
        print(self.ok_line(tot))
        # A FALL is where `--why` earns its place: "it went down" and "it went down
        # because that function grew the arm" are different confidence levels, and
        # only the second rules out a detector that stopped seeing something.
        if self.named is not None:
            was = self.load_baseline()["total"]
            if any(tot[c] < was.get(c, 0) for c in self.codes):
                print(f"  below baseline — `python3 scripts/{self.script} --why` names "
                      "which entries left")
        return 0

    def exempt_codes(self):
        """The codes scripts/lint-self.sh still tolerates: exactly those the
        committed baseline still owes. At zero this prints nothing and the gate
        bites."""
        total = self.load_baseline()["total"]
        print(" ".join(c for c in self.codes if total.get(c, 0) > 0))
        return 0

    def baseline_commit(self):
        """The tree the baseline's numbers describe: the `commit` it records, else
        the commit that last CHANGED the baseline file — which is the tree the last
        `--write-baseline` ran against, and is what lets a ratchet whose committed
        baseline predates the `commit` field still attribute a fall. Empty when git
        cannot answer either."""
        at = self.load_baseline().get("commit", "")
        if at:
            return at
        try:
            r = subprocess.run(
                ["git", "-C", ROOT, "log", "-1", "--format=%h", "--", self.baseline],
                capture_output=True, text=True, timeout=10,
            )
            return r.stdout.strip() if r.returncode == 0 else ""
        except (OSError, subprocess.SubprocessError):
            return ""

    def why(self, since):
        """What LEFT and what ENTERED the reported set since the baseline was
        written.

        The baseline's `commit` says which tree its numbers describe; `--why <rev>`
        overrides it. Both sides are re-derived by the SAME walk, so a name that
        left is a name that stopped qualifying — not a parser that stopped
        matching."""
        at = since or self.baseline_commit()
        if not at:
            raise SystemExit(
                f"{self.stem}: the baseline records no `commit`, so a fall cannot be\n"
                "attributed. Pass one — `--why <rev>` — or re-run `--write-baseline`,\n"
                "which records the tree its numbers were taken from.")
        tmp = tree_at(at, self.stem, self.tree_paths)
        try:
            was = self.named(tmp)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        now = self.named(ROOT)
        print(f"{self.label}: {at} -> working tree\n")
        moved = 0
        for code in self.codes:
            a, b = was[code], now[code]
            print(f"{code}  {sum(a.values())} hits over {len(a)} names -> "
                  f"{sum(b.values())} over {len(b)}")
            for n in sorted(set(a) - set(b)):
                print(f"  LEFT     {n}" + (f"  (x{a[n]})" if a[n] > 1 else ""))
                moved += 1
            for n in sorted(set(b) - set(a)):
                print(f"  ENTERED  {n}" + (f"  (x{b[n]})" if b[n] > 1 else ""))
                moved += 1
            for n in sorted(set(a) & set(b)):
                if a[n] != b[n]:
                    print(f"  {n}  {a[n]} -> {b[n]}")
                    moved += 1
            if sum(a.values()) == sum(b.values()) and set(a) == set(b):
                print("  (the same entries, by name)")
            print()
        if moved == 0:
            print("Nothing moved by name. A count that differs without a name moving "
                  "is the instrument, not the tree.")
        return 0


if __name__ == "__main__":
    print("scripts/ratchet.py is the shared core, not a command. The ratchets are\n"
          "  comment-budget.py  ladder-budget.py  sentinel-budget.py\n"
          "  scan-budget.py  seed-size.py")
    sys.exit(2)
