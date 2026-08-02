# struct-aos - ARRAY OF STRUCTS traversal (see struct-soa for the parallel-lists twin).
# ROUNDS is reduced 8.33x vs the other three (see meta.json nPython / expectPython).
N = 1_000_000
ROUNDS = 60


class P:
    __slots__ = ("x", "y", "z", "w")

    def __init__(self, x, y, z, w):
        self.x = x
        self.y = y
        self.z = z
        self.w = w


def run(n, rounds):
    ps = []
    for i in range(n):
        ps.append(P(i & 1023, (i * 3) & 1023, (i * 7) & 1023, (i * 11) & 1023))
    total = 0
    for r in range(rounds):
        s = 0
        for i in range(n):
            p = ps[i]
            s += (p.x ^ r) + p.z
        total += s
    return total


print(run(N, ROUNDS))
