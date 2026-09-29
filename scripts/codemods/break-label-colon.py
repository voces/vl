#!/usr/bin/env python3
"""Rewrite the pre-colon label spelling `break B` / `continue B` to `break :B` / `continue :B`.

A label is marked at the exit since the 2026-09-29 ruling (DECISIONS.md, "Labels are marked at
the exit"), and `break x` now breaks with the value of `x`. This rewrites a `break`/`continue`
followed on the same line by a name that the same file declares as a loop label (`B: while`,
`B: for`) and nothing else before the statement ends. Comments and string literals are left
alone. A name no loop in the file declares is reported, not rewritten: under the new reading
it is a value, and only the author knows which was meant.

Usage: break-label-colon.py [--check] PATH...   (a directory is walked for *.vl files)
Exit status: 0 when nothing needed rewriting (or --check found nothing), 1 otherwise.
"""
import os
import re
import sys

LABEL_DECL = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:while|for)\b")
JUMP = re.compile(r"\b(break|continue)([ \t]+)([A-Za-z_][A-Za-z0-9_]*)(?=[ \t]*(?:;|\}|$))")


def code_spans(line, state):
    """Split one line into (text, is_code) runs. `state` carries an open block comment."""
    out = []
    i = 0
    start = 0
    n = len(line)
    in_str = None
    while i < n:
        c = line[i]
        if state["block"]:
            if line.startswith("*/", i):
                state["block"] = False
                i += 2
                start = i
                continue
            i += 1
            continue
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == in_str:
                in_str = None
                start = i + 1
            i += 1
            continue
        if line.startswith("//", i):
            out.append((line[start:i], True))
            out.append((line[i:], False))
            return out
        if line.startswith("/*", i):
            out.append((line[start:i], True))
            state["block"] = True
            i += 2
            continue
        if c in "\"'`":
            out.append((line[start:i], True))
            in_str = c
            j = i + 1
            # the literal itself is not code; emitted when it closes
            k = j
            while k < n:
                if line[k] == "\\":
                    k += 2
                    continue
                if line[k] == c:
                    break
                k += 1
            out.append((line[i:k + 1], False))
            i = k + 1
            start = i
            in_str = None
            continue
        i += 1
    if not state["block"]:
        out.append((line[start:], True))
    return out


def rewrite(src):
    labels = set(LABEL_DECL.findall(src))
    state = {"block": False}
    lines = src.split("\n")
    changed = 0
    unknown = []
    for li, line in enumerate(lines):
        runs = code_spans(line, state)
        if "".join(t for t, _ in runs) != line:
            continue  # a run split that does not round-trip: leave the line alone
        new = []
        for text, is_code in runs:
            if is_code:
                def sub(m):
                    nonlocal changed
                    if m.group(3) in labels:
                        changed += 1
                        return m.group(1) + m.group(2) + ":" + m.group(3)
                    unknown.append((li + 1, m.group(0)))
                    return m.group(0)
                text = JUMP.sub(sub, text)
            new.append(text)
        lines[li] = "".join(new)
    return "\n".join(lines), changed, unknown


def files(paths):
    for p in paths:
        if os.path.isdir(p):
            for root, _, names in os.walk(p):
                for nm in sorted(names):
                    if nm.endswith(".vl"):
                        yield os.path.join(root, nm)
        elif os.path.isfile(p):
            yield p
        else:
            print(f"{p}: no such file or directory")


def main(argv):
    check = "--check" in argv
    paths = [a for a in argv if a != "--check"]
    if not paths:
        print(__doc__)
        return 2
    total = 0
    for f in files(paths):
        src = open(f, encoding="utf-8").read()
        out, n, unknown = rewrite(src)
        for ln, text in unknown:
            if text.startswith("continue"):
                print(f"{f}:{ln}: `{text}` names no loop label in this file; fix it by hand")
        if n:
            total += n
            print(f"{f}: {n} jump(s) {'to rewrite' if check else 'rewritten'}")
            if not check:
                open(f, "w", encoding="utf-8").write(out)
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
