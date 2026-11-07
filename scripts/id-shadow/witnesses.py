#!/usr/bin/env python3
"""Write each inventory row's `Repro:` block to OUT/<inventory>-<row>.vl.

    python3 -I scripts/id-shadow/witnesses.py OUT DIR...

A block is the fenced or indented text after a `Repro:` line, up to the first line that is
neither blank nor indented. This approximates `scripts/lib/inventory.vl`'s grammar; it is
what the identity shadow sweeps, not a grader.
"""
import os
import sys


def blocks(text):
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        if lines[i].strip().startswith("Repro:"):
            i += 1
            while i < len(lines) and lines[i].strip() == "":
                i += 1
            body = []
            if i < len(lines) and lines[i].strip().startswith("```"):
                i += 1
                while i < len(lines) and not lines[i].strip().startswith("```"):
                    body.append(lines[i])
                    i += 1
            else:
                while i < len(lines) and (lines[i].strip() == "" or lines[i].startswith("    ")):
                    body.append(lines[i][4:])
                    i += 1
            if any(b.strip() for b in body):
                yield "\n".join(body).strip("\n") + "\n"
        i += 1


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    n = 0
    for d in sys.argv[2:]:
        tag = os.path.basename(d.rstrip("/"))
        for f in sorted(os.listdir(d)):
            if not (f.startswith("D") and f.endswith(".md")):
                continue
            with open(os.path.join(d, f)) as fh:
                for k, b in enumerate(blocks(fh.read())):
                    name = f"{tag}-{f[:-3]}" + (f"-{k}" if k else "") + ".vl"
                    with open(os.path.join(out, name), "w") as w:
                        w.write(b)
                    n += 1
    print(n)


main()
