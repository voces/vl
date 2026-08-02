# lambda-hot — the cost of CALLING, in a hot loop, in four spellings of the
# same function `(x) => (x + k) & 15`:
#
#   phase 1  inlined by hand (no call at all)      — the floor
#   phase 2  a named function                      — a direct call
#   phase 3  a non-capturing lambda in a local     — a call through a value
#   phase 4  a lambda that CAPTURES a local        — a closure call
#
# Idiomatic Python: while loops so the loop shape matches the other three
# (a `for i in range(n)` would hand part of the work to C).
# All values stay under 2^20, so no overflow rules are involved.

import sys


def bump(x):
    return (x + 1) & 15


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 4000000
    mask = 1048575

    # phase 1 — no call
    a1 = 0
    i = 0
    while i < n:
        a1 = (a1 + (i & 15)) & mask
        i += 1
    print(a1)

    # phase 2 — direct call to a named function
    a2 = 0
    i = 0
    while i < n:
        a2 = (a2 + bump(i)) & mask
        i += 1
    print(a2)

    # phase 3 — a non-capturing lambda held in a local
    f3 = lambda x: (x + 2) & 15
    a3 = 0
    i = 0
    while i < n:
        a3 = (a3 + f3(i)) & mask
        i += 1
    print(a3)

    # phase 4 — a lambda that captures a local
    k = 3
    f4 = lambda x: (x + k) & 15
    a4 = 0
    i = 0
    while i < n:
        a4 = (a4 + f4(i)) & mask
        i += 1
    print(a4)


main()
