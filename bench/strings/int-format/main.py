# int-format — see main.vl
# N is reduced 30x vs the other three (see meta.json nPython/expectPython).
N = 1000000


def main():
    total_len = 0
    acc = 0
    v = 1
    for i in range(N):
        v = (v * 31 + 17) % 999983
        out = v
        if i % 5 == 0:
            out = 0 - out
        s = str(out)
        total_len = total_len + len(s)
        for ch in s:
            acc = acc + ord(ch)
    print(total_len)
    print(acc)


main()
