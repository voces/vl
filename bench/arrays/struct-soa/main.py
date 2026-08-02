# struct-soa - STRUCT OF ARRAYS traversal; the parallel-lists twin of struct-aos.
# ROUNDS is reduced 8.33x vs the other three (see meta.json nPython / expectPython).
N = 1_000_000
ROUNDS = 60


def run(n, rounds):
    xs = []
    ys = []
    zs = []
    ws = []
    for i in range(n):
        xs.append(i & 1023)
        ys.append((i * 3) & 1023)
        zs.append((i * 7) & 1023)
        ws.append((i * 11) & 1023)
    total = 0
    for r in range(rounds):
        s = 0
        for i in range(n):
            s += (xs[i] ^ r) + zs[i]
        total += s
    return total


print(run(N, ROUNDS))
