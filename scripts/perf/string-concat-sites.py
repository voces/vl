#!/usr/bin/env python3
"""Count the two O(n^2) string shapes in `compiler/*.vl` + `std/*.vl`.

    scripts/perf/string-concat-sites.py [--list N]

(a) `x = x + <expr>` where x is a string, INSIDE a while/for — quadratic in the
    built length, because `__str_concat__` allocates an exact-fit backing and
    copies both operands every step (compiler/emit_sections.vl:2341).
(b) a chain of 3+ string operands in one expression — each `+` is its own call,
    so a k-operand chain copies the prefix k-1 times.

`+=` desugars to `x = x + …` in the parser, so both spellings are matched. A
binding counts as a string when its nearest preceding declaration annotates
`string` or initialises from a string literal.
"""
import collections
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SELF = re.compile(r"^\s*(\w+)\s*(?:\+)?=\s*\1\s*\+")
DECL = re.compile(r"^\s*(?:let|const)\s+(\w+)\s*(?::\s*string\b|=\s*\"\")")
LOOP = re.compile(r"^\s*(?:\}\s*)?(?:while|for)\b")


def strip(line: str) -> str:
    """Drop line comments and string literals so `+` inside text is not counted."""
    out, i, q = [], 0, False
    while i < len(line):
        c = line[i]
        if not q and c == "/" and line[i:i + 2] == "//":
            break
        if c == '"' and (i == 0 or line[i - 1] != "\\"):
            q = not q
            out.append('"')
        elif not q:
            out.append(c)
        i += 1
    return "".join(out)


def main(argv: list[str]) -> int:
    want = int(argv[argv.index("--list") + 1]) if "--list" in argv else 0
    files = sorted(ROOT.glob("compiler/*.vl")) + sorted(ROOT.glob("std/*.vl"))
    per_file: collections.Counter[str] = collections.Counter()
    sites, chains = [], collections.Counter()
    total_self = deep = 0
    chain_in_loop = 0
    for f in files:
        strings: set[str] = set()
        depth = 0
        loop_at: list[int] = []
        for no, raw in enumerate(f.read_text().splitlines(), 1):
            line = strip(raw)
            d = DECL.match(line)
            if d:
                strings.add(d.group(1))
            opening = LOOP.match(line) and "{" in line
            m = SELF.match(line)
            if m and m.group(1) in strings:
                total_self += 1
                if loop_at:
                    per_file[f.name] += 1
                    sites.append((len(loop_at), f"{f.relative_to(ROOT)}:{no}", raw.strip()))
                    if len(loop_at) >= 2:
                        deep += 1
            # A 3+ operand chain: two `+` with a quote or a string name around.
            if line.count(" + ") >= 2 and ('"' in line or (m and m.group(1) in strings)):
                k = line.count(" + ") + 1
                chains[k] += 1
                if loop_at:
                    chain_in_loop += 1
            depth += line.count("{") - line.count("}")
            if opening:
                loop_at.append(depth)
            while loop_at and depth < loop_at[-1]:
                loop_at.pop()
    in_loop = sum(per_file.values())
    print(f"(a) string self-append sites: {total_self} total, {in_loop} inside a loop, "
          f"{deep} at loop depth >= 2")
    for name, n in per_file.most_common():
        print(f"    {n:4d}  {name}")
    tot = sum(chains.values())
    print(f"(b) chains of 3+ string operands: {tot}, {chain_in_loop} inside a loop")
    for k in sorted(chains, reverse=True)[:6]:
        print(f"    {chains[k]:4d}  x {k} operands")
    for lvl, where, text in sorted(sites, reverse=True)[:want]:
        print(f"    L{lvl} {where}  {text[:80]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
