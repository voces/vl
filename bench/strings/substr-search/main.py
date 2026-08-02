# substr-search — see main.vl
# `str.find` is a C routine (Crochemore-Perrin two-way with a Bloom-filter
# skip); this is one of the places CPython's C library beats an interpreted
# loop by a wide margin.
ALPHA = "abcdefghijklmnopqrstuvwxyz"

LEN = 1000000
NEEDLE_W = 12
NN = 16
PASSES = 60


def build_input(n):
    chunk = ""
    for i in range(16384):
        k = (i * 31 + (i // 7) * 17 + (i // 601) * 5) % 26
        chunk = chunk + ALPHA[k:k + 1]
    s = chunk
    while len(s) < n:
        s = s + s
    return s[0:n]


def main():
    s = build_input(LEN)
    needles = []
    for k in range(NN):
        off = k * 977
        t = s[off:off + NEEDLE_W]
        if k % 2 == 1:
            needles.append(t[0:6] + "Q" + t[7:NEEDLE_W])
        else:
            needles.append(t)
    acc = 0
    for _ in range(PASSES):
        for q in range(NN):
            acc = acc + s.find(needles[q])
    print(acc)


main()
