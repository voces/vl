#!/usr/bin/env python3
"""Rewrite the pre-colon label spelling `break B` / `continue B` to `break :B` / `continue :B`.

A label is marked at the exit since the 2026-09-29 ruling (DECISIONS.md, "Labels are marked at
the exit"), and `break x` now breaks with the value of `x`. This rewrites a `break`/`continue`
followed on the same line by a name, and nothing else before the statement ends, when that
name labels a loop (`B: while`, `B: for`) the jump is lexically inside. Comments and string
literals are left alone. Any other name is reported, not rewritten: under the new reading it is
a value, and only the author knows which was meant.

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
    """Rewrite each jump whose name labels a loop the jump is lexically inside."""
    state = {"block": False}
    lines = src.split("\n")
    changed = 0
    unknown = []
    depth = 0          # open `{` in code
    active = []        # (label, depth of the loop body's `{`)
    pending = None     # a label declared, whose loop body `{` is still to come
    for li, line in enumerate(lines):
        runs = code_spans(line, state)
        if "".join(t for t, _ in runs) != line:
            continue  # a run split that does not round-trip: leave the line alone
        new = []
        for text, is_code in runs:
            if not is_code:
                new.append(text)
                continue
            out = []
            i = 0
            while i < len(text):
                m = LABEL_DECL.match(text, i)
                if m and (i == 0 or not (text[i - 1].isalnum() or text[i - 1] == "_")):
                    pending = m.group(1)
                    out.append(m.group(0))
                    i = m.end()
                    continue
                j = JUMP.match(text, i)
                if j and (i == 0 or not (text[i - 1].isalnum() or text[i - 1] == "_")):
                    if any(lab == j.group(3) for lab, _ in active):
                        changed += 1
                        out.append(j.group(1) + j.group(2) + ":" + j.group(3))
                    else:
                        unknown.append((li + 1, j.group(0)))
                        out.append(j.group(0))
                    i = j.end()
                    continue
                c = text[i]
                if c == "{":
                    depth += 1
                    if pending is not None:
                        active.append((pending, depth))
                        pending = None
                elif c == "}":
                    while active and active[-1][1] == depth:
                        active.pop()
                    depth -= 1
                out.append(c)
                i += 1
            new.append("".join(out))
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
                print(f"{f}:{ln}: `{text}` names no enclosing loop label; fix it by hand")
        if n:
            total += n
            print(f"{f}: {n} jump(s) {'to rewrite' if check else 'rewritten'}")
            if not check:
                open(f, "w", encoding="utf-8").write(out)
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
