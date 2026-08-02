# concat-build — see main.vl
# NOTE: CPython special-cases `s = s + t` / `s += t` on str when the target
# holds the only reference, growing in place (amortised O(1)); that is why
# the naive spelling is not quadratic here. Python str is unicode; ASCII in.
# REPS is reduced 4x vs the other three (see meta.json nPython/expectPython).
ALPHA = "abcdefghijklmnopqrstuvwxyz"

N = 5000
REPS = 250


def main():
    total = 0
    for r in range(REPS):
        s = ""
        for i in range(N):
            k = (i + r) % 26
            s = s + ALPHA[k:k + 1]
        total = total + len(s) + ord(s[len(s) - 1])
    print(total)


main()
