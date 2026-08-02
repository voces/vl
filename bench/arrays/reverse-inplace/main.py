# reverse-inplace - hand-written two-pointer in-place reverse (NOT list.reverse),
# N elements, ROUNDS times.
# ROUNDS is reduced 16x vs the other three (see meta.json nPython / expectPython).
N = 4_000_000
ROUNDS = 25


def run(n, rounds):
    a = []
    for i in range(n):
        a.append((i * 7 + 3) & 1048575)
    chk = 0
    for r in range(rounds):
        bump = r % n
        a[bump] = a[bump] + 1
        lo = 0
        hi = n - 1
        while lo < hi:
            t = a[lo]
            a[lo] = a[hi]
            a[hi] = t
            lo += 1
            hi -= 1
        for i in range(0, n, 65536):
            chk += a[i]
    return chk


print(run(N, ROUNDS))
