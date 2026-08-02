# push-growth - build a list of N elements from EMPTY by repeated append, ROUNDS times.
# ROUNDS is reduced 5x vs the other three (see meta.json nPython / expectPython).
N = 1_000_000
ROUNDS = 40


def run(n, rounds):
    total = 0
    for r in range(rounds):
        a = []
        for i in range(n):
            a.append((i ^ r) & 1023)
        total += len(a)
        for i in range(0, n, 64):
            total += a[i]
    return total


print(run(N, ROUNDS))
