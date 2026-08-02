# Allocating many short-lived structs — the binary-trees GC-pressure shape.
# See main.vl.
#
# Idiomatic Python: a plain class with two attributes. CPython reclaims each tree
# by refcount as soon as it is dropped. maxDepth is REDUCED from 16 to 12
# (see meta.json nPython / expectPython) — that is ~22x fewer nodes.


class Nd:
    def __init__(self, l, r):
        self.l = l
        self.r = r


def build(d):
    if d == 0:
        return Nd(None, None)
    return Nd(build(d - 1), build(d - 1))


def count(n):
    s = 1
    if n.l is not None:
        s += count(n.l)
    if n.r is not None:
        s += count(n.r)
    return s


def main():
    max_depth = 12
    rounds = 4

    total = 0
    d = 4
    while d <= max_depth:
        iters = (1 << (max_depth - d + 4)) * rounds
        s = 0
        i = 0
        while i < iters:
            s += count(build(d))
            i += 1
        total += s
        d += 2

    long_lived = build(max_depth)

    print(total)
    print(count(long_lived))


main()
