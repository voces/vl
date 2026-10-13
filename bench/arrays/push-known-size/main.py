# push-known-size — sunpa SP-036's 4x4 matrix product, building its result with `append`.
import math

N = 50000


def m4_mul(a, b):
    o = []
    for c in range(4):
        for r in range(4):
            s = 0.0
            for k in range(4):
                s = s + a[k * 4 + r] * b[c * 4 + k]
            o.append(s)
    return o


def run(n):
    m = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0]
    t = [0.999, 0.01, 0.0, 0.0, -0.01, 0.999, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.1, 0.2, 0.3, 1.0]
    for _ in range(n):
        m = m4_mul(m, t)
    return math.trunc(m[12] * 1000000.0)


print(run(N))
