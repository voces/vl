#!/usr/bin/env python3
"""One-line-per-cell serialisation for the corpus grade maps.

These files are rewritten by nearly every defect PR, so their FORMAT is a
review and merge concern, not a storage one. Pretty-printed JSON spent four
lines on each cell, which meant a 207-cell change arrived as an 860-line diff
and a rebase resolved cell boundaries wrongly without saying so — twice in one
day, once silently corrupting the baseline.

One JSON object per line, sorted by cell, makes a changed cell exactly one
changed line and keeps a merge conflict inside the cell it belongs to.
"""
import json


def load_cells(path):
    """Read a {cell: {...}} map from a one-object-per-line file."""
    out = {}
    with open(path) as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            out[rec.pop("cell")] = rec
    return out


def dump_cells(path, cells):
    """Write a {cell: {...}} map, one object per line, sorted by cell."""
    with open(path, "w") as fh:
        for c in sorted(cells):
            rec = {"cell": c}
            rec.update({k: cells[c][k] for k in sorted(cells[c])})
            fh.write(json.dumps(rec, sort_keys=False) + "\n")
