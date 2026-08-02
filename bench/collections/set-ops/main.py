# Set operations over string elements. See main.vl for the shape.
#
# Idiomatic Python: a plain `set` of str. Python also has `a & b` / `a - b`;
# the explicit membership loops are used so all four runtimes run the identical
# algorithm (VL has no set algebra). N is REDUCED (see meta.json nPython /
# expectPython).


def main():
    n = 25_000
    r = 100
    half = n // 2

    aw = []
    for i in range(n):
        aw.append("w" + str(i))
    bw = []
    for i in range(n):
        bw.append("w" + str(i + half))

    a = set()
    for i in range(n):
        a.add(aw[i])
    b = set()
    for i in range(n):
        b.add(bw[i])

    inter = 0
    only_a = 0
    only_b = 0
    for _ in range(r):
        for i in range(n):
            if aw[i] in b:
                inter += 1
            else:
                only_a += 1
        for i in range(n):
            if bw[i] not in a:
                only_b += 1

    lensum = 0
    for x in a:
        lensum += len(x)

    print(len(a))
    print(len(b))
    print(inter)
    print(only_a)
    print(only_b)
    print(lensum)


main()
