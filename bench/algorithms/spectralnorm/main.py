# spectral-norm — adapted from the Computer Language Benchmarks Game
# `spectralnorm` program. Idiomatic Python: lists of floats and index loops.
# No numpy (numpy would measure C, not Python).
#
# ADAPTATION: prints through the same integer-scaling fmt9 as the other three
# languages instead of "%.9f".

import sys
from math import sqrt


def fmt9(v):
    sign = ""
    a = v
    if v < 0.0:
        sign = "-"
        a = -v
    scaled = int(a * 1000000000.0 + 0.5)
    ip = scaled // 1000000000
    fp = scaled % 1000000000
    return sign + str(ip) + "." + str(fp).rjust(9, "0")


def aij(i, j):
    s = i + j
    d = s * (s + 1) // 2 + i + 1
    return 1.0 / d


def multiply_av(n, v, out):
    for i in range(n):
        s = 0.0
        for j in range(n):
            s += aij(i, j) * v[j]
        out[i] = s


def multiply_atv(n, v, out):
    for i in range(n):
        s = 0.0
        for j in range(n):
            s += aij(j, i) * v[j]
        out[i] = s


def multiply_at_av(n, v, out, tmp):
    multiply_av(n, v, tmp)
    multiply_atv(n, tmp, out)


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 550
    u = [1.0] * n
    v = [0.0] * n
    tmp = [0.0] * n

    for _ in range(10):
        multiply_at_av(n, u, v, tmp)
        multiply_at_av(n, v, u, tmp)

    v_bv = 0.0
    vv = 0.0
    for i in range(n):
        v_bv += u[i] * v[i]
        vv += v[i] * v[i]
    print(fmt9(sqrt(v_bv / vv)))


main()
