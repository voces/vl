# dispatch-table — function values called INDIRECTLY, the shape every plugin
# registry / interpreter / state machine has:
#
#   phase 1  an if/elif chain calling the four operations directly — the floor
#   phase 2  the four operations in a LIST of function values, indexed
#   phase 3  the four operations in an ATTRIBUTE of an object, in a list of them
#
# Idiomatic Python.

import sys


def op0(x):
    return (x + 1) & 15


def op1(x):
    return (x + 2) & 15


def op2(x):
    return (x * 3) & 15


def op3(x):
    return (x ^ 5) & 15


class Op:
    __slots__ = ("f", "name")

    def __init__(self, f, name):
        self.f = f
        self.name = name


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5000000
    mask = 1048575

    # phase 1 — an if/elif chain, direct calls
    a1 = 0
    i = 0
    while i < n:
        k = i & 3
        if k == 0:
            v = op0(i)
        elif k == 1:
            v = op1(i)
        elif k == 2:
            v = op2(i)
        else:
            v = op3(i)
        a1 = (a1 + v) & mask
        i += 1
    print(a1)

    # phase 2 — a list of function values
    fs = [op0, op1, op2, op3]
    a2 = 0
    i = 0
    while i < n:
        a2 = (a2 + fs[i & 3](i)) & mask
        i += 1
    print(a2)

    # phase 3 — a function value in an object ATTRIBUTE
    ops = [Op(op0, "add1"), Op(op1, "add2"), Op(op2, "mul3"), Op(op3, "xor5")]
    a3 = 0
    i = 0
    while i < n:
        a3 = (a3 + ops[i & 3].f(i)) & mask
        i += 1
    print(a3)


main()
