# String-keyed map. See main.vl for the shape.
#
# Idiomatic Python: a plain dict with str keys. N is REDUCED (see meta.json
# nPython / expectPython).


def main():
    n = 25_000
    r = 150
    total = 2 * n

    ins_keys = []
    for i in range(n):
        ins_keys.append("key" + str(i))
    # Distinct objects, equal content for the first n.
    probe = []
    for i in range(total):
        probe.append("key" + str(i))

    m = {}
    for i in range(n):
        m[ins_keys[i]] = i * 3 + 1

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
