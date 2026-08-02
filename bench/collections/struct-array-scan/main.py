# An array of structs, scanned by field. See main.vl.
#
# Idiomatic Python: a list of plain-class instances. N and R are REDUCED
# (see meta.json nPython / expectPython).


class Rec:
    def __init__(self, id, a, b, c):
        self.id = id
        self.a = a
        self.b = b
        self.c = c


def main():
    n = 500_000
    r = 20

    recs = []
    for i in range(n):
        recs.append(Rec(i, i & 7, (i * 3) & 65535, (i * 7) & 4095))

    sum_b = 0
    cnt = 0
    sum_c = 0
    for _ in range(r):
        for i in range(n):
            rec = recs[i]
            sum_b += rec.b
            if rec.a == 0:
                cnt += 1
                sum_c += rec.c

    print(len(recs))
    print(sum_b)
    print(cnt)
    print(sum_c)


main()
