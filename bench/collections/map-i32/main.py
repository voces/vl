# i32-keyed map. Same skeleton as ../map-string with the key type changed.
#
# Idiomatic Python: a plain dict with int keys. Python has a large structural
# advantage here — `hash(int)` is the identity, so the hash is free and the keys
# (a spread-by-7 arithmetic sequence) distribute perfectly. N is REDUCED
# (see meta.json nPython / expectPython).


def main():
    n = 50_000
    r = 100
    total = 2 * n

    probe = []
    for i in range(n):
        probe.append(i * 7 + 3)
    for i in range(n):
        probe.append(i * 7 + 4)

    m = {}
    for i in range(n):
        m[i * 7 + 3] = i * 3 + 1

    hits = 0
    misses = 0
    for _ in range(r):
        for i in range(total):
            v = m.get(probe[i], -1)
            if v == -1:
                misses += 1
            else:
                hits += v

    it = 0
    for v in m.values():
        it += v

    print(len(m))
    print(hits)
    print(misses)
    print(it)


main()
