# token-count — see main.vl
# The state machine is hand-written to match the other three exactly.
# `s.split()` would be the idiomatic Python one-liner; it is measured
# separately (see meta.json notes) rather than substituted here, because that
# would change the algorithm.
# PASSES is reduced 20x vs the other three (see meta.json nPython/expectPython).
ALPHA = "abcdefghijklmnopqrstuvwxyz"

LEN = 1000000
PASSES = 50


def build_input(n):
    chunk = ""
    for i in range(1024):
        if (i * 7 + i // 5) % 11 == 0:
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
    tokens = 0
    total_len = 0
    max_len = 0
    for _ in range(PASSES):
        in_tok = False
        cur_len = 0
        for ch in s:
            c = ord(ch)
            if c == 32:
                if in_tok:
                    tokens = tokens + 1
                    total_len = total_len + cur_len
                    if cur_len > max_len:
                        max_len = cur_len
                    in_tok = False
                    cur_len = 0
            else:
                in_tok = True
                cur_len = cur_len + 1
        if in_tok:
            tokens = tokens + 1
            total_len = total_len + cur_len
            if cur_len > max_len:
                max_len = cur_len
    print(tokens)
    print(total_len)
    print(max_len)


main()
