#!/usr/bin/env python3
"""Rewrite labels to the `@` spelling: `B: { … }` → `@B { … }`, `L: while` → `@L while`,
`L: for` → `@L for`, `break :B` → `break @B`, `continue :L` → `continue @L`.

Labels are one token, `@name`, at the declaration and at the jump since the 2026-09-30 ruling
(DECISIONS.md, "A label is `@name`"), and `{ name: … }` is always an object literal. This
rewrites every `break :X` / `continue :X`, every `X: while` / `X: for` that stands where a
statement or a value starts, and every `X: {` the old parser read as a label: one holding a
`break :X` / `continue :X`, one standing mid-block or as a value (after `=`, `=>`, `return` or
`break`, where `break X: { … }` becomes `break (@X { … })`), and one first in a brace whose
own braces do not open like an object (`{ name: …`, `{ name, …`, `{ name }`, `{}`, a map type
`{[K]: V}`). What is left alone is an object: first in a body, `X: {}` or `X: { name }` with no
jump naming `X` now reads as a field, as the ruling says. Comments and string literals are
never touched; the code in a string's interpolation hole is.

Usage: label-at.py [--check] PATH...   (a directory is walked for *.vl files)
Exit status: 0 when nothing needed rewriting (or --check found nothing), 1 otherwise.
"""
import os
import re
import sys

IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
# Tokens after which a statement or a value starts, so `X: while` there is a label.
LABEL_BEFORE = {None, "{", "}", ";", "=", "(", "=>", "return", "[", "break"}
# Tokens after which `X: {` is a value, which the old parser always read as a label.
VALUE_BEFORE = {"=", "=>", "return", "break", "\\{"}
# The words that open a statement, so `{ return }` is a block and not a shorthand object.
KEYWORDS = {"let", "const", "return", "if", "while", "for", "break", "continue", "type",
            "function", "match"}
# Tokens a line break does not end a statement after: a field or argument continues.
OPEN_BEFORE = {",", "{", "(", "[", "=", ":", "=>"}
# Tokens after which a `{` opens a type or an object literal, never a block of statements.
VALUE_BRACE_AFTER = {":", "=", "|", "&", "<", ",", "(", "[", "return", "?"}


def scan_quoted(src, i, q):
    """From just past an opening quote `q`: (index past the literal, True) at its close, or
    (index past a `\\{`, False) at an interpolation hole, whose code the caller then scans."""
    n = len(src)
    while i < n:
        c = src[i]
        if c == "\\":
            if src.startswith("\\{", i):
                return i + 2, False
            i += 2
        elif c == q:
            return i + 1, True
        else:
            i += 1
    return n, True


def tokens(src):
    """Yield (kind, text, start) over the code of `src`: 'id', 'nl' or a punctuation string.

    String and char literals and comments are skipped, so a label-shaped run inside one is never
    seen; the code in a string's `\\{…}` hole is scanned as code. `=>` is kept whole; every other
    punctuation character is its own token.
    """
    i = 0
    n = len(src)
    depth = 0
    holes = []  # (brace depth the hole opened at, its string's quote)
    while i < n:
        c = src[i]
        if c == "}" and holes and holes[-1][0] == depth:
            _, q = holes.pop()
            i, closed = scan_quoted(src, i + 1, q)
            if not closed:
                holes.append((depth, q))
                yield ("p", "\\{", i - 2)
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        if c == "\n":
            yield ("nl", "\n", i)
            i += 1
        elif c in " \t\r":
            i += 1
        elif src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
        elif c == '"' or c == "'":
            yield ("s", c, i)
            i, closed = scan_quoted(src, i + 1, c)
            if not closed:
                holes.append((depth, c))
                yield ("p", "\\{", i - 2)
        elif c.isalpha() or c == "_":
            m = IDENT.match(src, i)
            yield ("id", m.group(0), i)
            i = m.end()
        elif src.startswith("=>", i):
            yield ("p", "=>", i)
            i += 2
        else:
            yield ("p", c, i)
            i += 1


def rewrite(src):
    """Return (new source, number of edits)."""
    sys.setrecursionlimit(max(sys.getrecursionlimit(), 20000))
    toks = list(tokens(src))
    n = len(toks)
    # Matching brace for every `{`.
    match = {}
    encl = [-1] * n  # the innermost `{` open around each token, -1 at the top level
    stack = []
    for k, (kind, text, _) in enumerate(toks):
        encl[k] = stack[-1] if stack else -1
        if kind == "p" and text == "{":
            stack.append(k)
        elif kind == "p" and text == "}" and stack:
            match[stack.pop()] = k

    memo = {}

    def jumped_inside(k):
        """Whether a `break :X` / `continue :X` naming `X` (token `k`, in `X: {`) is inside."""
        close = match.get(k + 2, k + 2)
        return any(k + 2 < q < close for q in jumps.get(toks[k][1], []))

    def opens_like_object(b):
        """Whether the braces opening at token `b` begin like an object literal or a type:
        `{}`, `{ name: …` (unless that is a label: `name: while`, `name: for`, or `name: {` over
        statements), `{ name, …`, `{ name }`, `{ name?: …`, `{ readonly name …`, a method
        `{ name(…) {`, `{ "key": …`, `{ ...spread`, or a map type `{[K]: V}`."""
        if b in memo:
            return memo[b]
        j = b + 1
        while j < n and toks[j][0] == "nl":
            j += 1
        memo[b] = ans = opens_like_object_at(j)
        return ans

    def opens_like_object_at(j):
        if j >= n:
            return False
        first = toks[j]
        if first[1] in ("}", "[", '"', "."):
            return True
        if first[0] != "id" or j + 1 >= n:
            return False
        nk = toks[j + 1][1]
        if nk == ":":
            t2 = toks[j + 2] if j + 2 < n else ("", "", 0)
            if t2[0] == "id" and t2[1] in ("while", "for"):
                return False  # a labelled loop opens the braces
            if t2[1] == "{" and (jumped_inside(j) or not opens_like_object(j + 2)):
                return False  # a labelled block opens them
            return True  # a key, `type:` included
        if first[1] in KEYWORDS:
            return False
        if nk in (",", "}", "?") or toks[j + 1][0] == "id":
            return True
        if nk != "(":
            return False
        # A method shorthand `{ name(…) {` or `{ name(…): T {`, not a call statement.
        d = 0
        q = j + 1
        while q < n:
            if toks[q][1] == "(":
                d += 1
            elif toks[q][1] == ")":
                d -= 1
                if d == 0:
                    break
            q += 1
        return q + 1 < n and toks[q + 1][1] in ("{", ":")

    def holds_statements(b):
        """Whether the `{` at token `b` can open a block: not one a type or a value opens. A
        label's braces (`X: {`) hold statements when they do not open like an object."""
        if b < 0:
            return True
        j = b - 1
        while j >= 0 and toks[j][0] == "nl":
            j -= 1
        if j < 0:
            return True
        if toks[j][1] == ":":
            return not opens_like_object(b)
        return toks[j][1] not in VALUE_BRACE_AFTER
    # Where each label name is jumped to: token indices of `break :X` / `continue :X`.
    jumps = {}
    edits = []  # (start, end, replacement)
    for k in range(n - 2):
        kind, text, pos = toks[k]
        if kind == "id" and text in ("break", "continue") and toks[k + 1][1] == ":" \
                and toks[k + 2][0] == "id":
            colon = toks[k + 1][2]
            name = toks[k + 2][1]
            jumps.setdefault(name, []).append(k)
            edits.append((colon, colon + 1, "@"))

    def prev(k):
        """The token before `k` ("\\n" for a line break) and the nearest one that is not a line
        break, or None at the start."""
        if k == 0:
            return None, None
        j = k - 1
        while j >= 0 and toks[j][0] == "nl":
            j -= 1
        near = "\n" if toks[k - 1][0] == "nl" else toks[k - 1][1]
        return near, (toks[j][1] if j >= 0 else None)

    for k in range(n - 3, -1, -1):
        kind, name, pos = toks[k]
        if kind != "id" or toks[k + 1][1] != ":" or toks[k + 2][0] == "nl":
            continue
        nxt = toks[k + 2]
        near, far = prev(k)
        if far in (".", "?"):
            continue
        # A statement starts here: after `;`, or a line break that no `,` or opener continues.
        stmt = (near == ";" or far is None or (near == "\n" and far not in OPEN_BEFORE)) \
            and holds_statements(encl[k])
        target = nxt[2]
        if nxt[0] == "id" and nxt[1] in ("while", "for"):
            if stmt or near in LABEL_BEFORE or (near == "\n" and far in LABEL_BEFORE):
                edits.append((pos, target, "@" + name + " "))
            continue
        if nxt[1] != "{":
            continue
        close = match.get(k + 2)
        if close is None:
            continue
        objlike = opens_like_object(k + 2)
        # A jump inside names it; mid-block and as a value it always was one; first in a brace
        # it was one when its braces held statements.
        inside = jumped_inside(k)
        value = near in VALUE_BEFORE or (near == "\n" and far in VALUE_BEFORE)
        first_in_brace = far in ("{", "(", "[") or near in ("}", ";")
        if inside or stmt or value or (first_in_brace and not objlike):
            if near == "break":
                # `break @B { … }` would name the label: the block is the value, so parenthesize.
                edits.append((pos, target, "(@" + name + " "))
                end = toks[close][2] + 1
                edits.append((end, end, ")"))
            else:
                edits.append((pos, target, "@" + name + " "))
    edits.sort()
    out = []
    last = 0
    for s, e, r in edits:
        out.append(src[last:s])
        out.append(r)
        last = e
    out.append(src[last:])
    return "".join(out), len(edits)


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
        out, n = rewrite(src)
        if n:
            total += n
            print(f"{f}: {n} site(s) {'to rewrite' if check else 'rewritten'}")
            if not check:
                open(f, "w", encoding="utf-8").write(out)
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
