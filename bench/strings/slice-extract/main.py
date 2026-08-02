# slice-extract — see main.vl
# NOTE: CPython `s[i:i+W]` always allocates a new str object and copies.
# PASSES is reduced 30x vs the other three (see meta.json nPython/expectPython).
ALPHA = "abcdefghijklmnopqrstuvwxyz"

LEN = 200000
W = 12
PASSES = 6


def build_input(n):
    chunk = ""
    for i in range(1024):
        k = (i * 31 + (i // 7) * 17) % 26
        chunk = chunk + ALPHA[k:k + 1]
    s = chunk
    while len(s) < n:
        s = s + s
    return s[0:n]


def main():
    s = build_input(LEN)
    acc = 0
    for _ in range(PASSES):
        limit = len(s) - W
        for i in range(limit + 1):
            t = s[i:i + W]
            h = 0
            for j in range(W):
                h = (h * 31 + ord(t[j])) % 1000003
            acc = acc + h
    print(acc)


main()
