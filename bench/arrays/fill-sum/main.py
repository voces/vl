# fill-sum - allocate an int array of N, then ROUNDS rounds of (fill in place, sum).
# ROUNDS is reduced 10x vs the other three (see meta.json nPython / expectPython).
N = 2_000_000
ROUNDS = 20


def run(n, rounds):
    a = [0] * n
    total = 0
    for r in range(rounds):
        for i in range(n):
            a[i] = (i + r) & 65535
        s = 0
        for i in range(n):
            s += a[i]
        total += s
    return total


print(run(N, ROUNDS))
