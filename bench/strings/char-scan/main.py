# char-scan — see main.vl
# NOTE: Python 3 `str` is a unicode sequence; the input is pure ASCII, so
# `ord(ch)` yields exactly the same code points VL's `s[i]` does.
# PASSES is reduced 10x vs the other three (see meta.json nPython/expectPython).
ALPHA = "abcdefghijklmnopqrstuvwxyz"

LEN = 1000000
PASSES = 60


def build_input(n):
    chunk = ""
    for i in range(1024):
        if i % 9 == 8:
            chunk = chunk + " "
        else:
            k = (i * 31 + (i // 7) * 17) % 26
            chunk = chunk + ALPHA[k:k + 1]
    s = chunk
    while len(s) < n:
        s = s + s
    return s[0:n]


def main():
    s = build_input(LEN)
    acc = 0
    vowels = 0
    for _ in range(PASSES):
        for ch in s:
            c = ord(ch)
            acc = acc + c
            if c == 97 or c == 101 or c == 105 or c == 111 or c == 117:
                vowels = vowels + 1
    print(acc)
    print(vowels)


main()
