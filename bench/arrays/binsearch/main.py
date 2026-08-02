# binsearch - QUERIES binary searches over a sorted list of N elements (hand-written,
# not the bisect module, so all four run the same code).
# QUERIES is reduced 20x vs the other three (see meta.json nPython / expectPython).
N = 4_000_000
QUERIES = 300_000


def bsearch(a, n, key):
    lo = 0
    hi = n - 1
    found = -1
    while lo <= hi:
        mid = (lo + hi) >> 1
        v = a[mid]
        if v < key:
            lo = mid + 1
        else:
            if v > key:
                hi = mid - 1
            else:
                found = mid
                lo = hi + 1
    return found


def run(n, queries):
    a = []
    for i in range(n):
        a.append(i * 3)
    seed = 987654321
    hits = 0
    idx_sum = 0
    for _q in range(queries):
        seed = (seed * 48271) % 2147483647
        key = seed % (3 * n)
        idx = bsearch(a, n, key)
        if idx >= 0:
            hits += 1
            idx_sum += idx
    print(hits)
    return idx_sum


print(run(N, QUERIES))
