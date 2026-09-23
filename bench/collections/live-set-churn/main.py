# A live table of LIVE structs held for the whole run, plus CHURN short-lived
# struct allocations. See main.vl. N and CHURN are REDUCED (see meta.json
# nPython / expectPython).


class Cell:
    def __init__(self, a, b, c):
        self.a = a
        self.b = b
        self.c = c


def main():
    live = 5_000
    churn = 3_000_000

    keep = []
    for i in range(live):
        keep.append(Cell(i, i + 1, i + 2))

    s = 0
    for i in range(churn):
        t = Cell(i, i & 7, 1)
        s += t.a + t.b + keep[i % live].c

    # pure addition, so a single mod-2^32 fold at the end equals per-step i32 wrapping
    s &= 0xFFFFFFFF
    print("sum " + str(s - 0x100000000 if s >= 0x80000000 else s))


main()
