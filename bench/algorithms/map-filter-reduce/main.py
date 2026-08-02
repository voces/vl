# map-filter-reduce — callback-heavy pipeline over a large array, in the
# three spellings a programmer actually chooses between:
#
#   phase A  the builtins:  list(map(f, xs)), list(filter(g, ys)), reduce(h, zs, 0)
#   phase B  hand-written loops that build the SAME two intermediate lists
#   phase C  one fused hand-written loop, no intermediate lists
#
# Idiomatic Python. No numpy.

import sys
from functools import reduce


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 2000000

    xs = []
    i = 0
    while i < n:
        xs.append(i & 1023)
        i += 1

    # phase A — builtin map / filter / reduce with lambda callbacks
    ys = list(map(lambda x: x * 3 + 1, xs))
    zs = list(filter(lambda y: (y & 7) == 3, ys))
    total_a = reduce(lambda acc, z: acc + z, zs, 0)
    print(total_a)

    # phase B — hand-written loops building the same two intermediate lists
    ys2 = []
    b = 0
    while b < len(xs):
        ys2.append(xs[b] * 3 + 1)
        b += 1
    zs2 = []
    c = 0
    while c < len(ys2):
        y = ys2[c]
        if (y & 7) == 3:
            zs2.append(y)
        c += 1
    total_b = 0
    d = 0
    while d < len(zs2):
        total_b += zs2[d]
        d += 1
    print(total_b)

    # phase C — one fused loop, no intermediates
    total_c = 0
    e = 0
    while e < len(xs):
        y = xs[e] * 3 + 1
        if (y & 7) == 3:
            total_c += y
        e += 1
    print(total_c)


main()
