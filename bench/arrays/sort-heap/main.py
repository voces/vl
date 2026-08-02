# sort-heap - HAND-WRITTEN heapsort (iterative sift-down), the SAME algorithm in all
# four languages. Deliberately NOT sorted(): this measures the language's list
# read/write/compare path, not a library.
# ROUNDS is reduced 4x vs the other three (see meta.json nPython / expectPython).
N = 1_000_000
ROUNDS = 1


def sift_down(a, start, last):
    root = start
    cont = True
    while cont and root * 2 + 1 <= last:
        child = root * 2 + 1
        if child + 1 <= last:
            if a[child] < a[child + 1]:
                child += 1
        if a[root] < a[child]:
            t = a[root]
            a[root] = a[child]
            a[child] = t
            root = child
        else:
            cont = False


def heapsort(a, n):
    i = (n - 2) >> 1
    while i >= 0:
        sift_down(a, i, n - 1)
        i -= 1
    last = n - 1
    while last > 0:
        t = a[0]
        a[0] = a[last]
        a[last] = t
        last -= 1
        sift_down(a, 0, last)


def run(n, rounds):
    a = [0] * n
    seed = 123456789
    chk = 0
    inv = 0
    last_sum = 0
    for _r in range(rounds):
        for i in range(n):
            seed = (seed * 48271) % 2147483647
            a[i] = seed
        heapsort(a, n)
        for i in range(0, n, 4096):
            chk += a[i]
        for i in range(1, n):
            if a[i - 1] > a[i]:
                inv += 1
        last_sum = 0
        for i in range(n):
            last_sum += a[i]
    print(chk)
    print(inv)
    return last_sum


print(run(N, ROUNDS))
