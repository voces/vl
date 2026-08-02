# matmul - naive dense N x N float matrix multiply, i-k-j order, over FLAT lists.
# N is reduced from 600 to 230 (see meta.json nPython / expectPython); the work is
# cubic in N, so this is a (600/230)^3 ~= 17.8x reduction.
N = 230
ROUNDS = 3


def run(n, rounds):
    a = []
    b = []
    c = []
    for i in range(n * n):
        a.append(((i * 31 + 7) % 97) * 0.125 - 6.0)
        b.append(((i * 17 + 3) % 89) * 0.125 - 5.5)
        c.append(0.0)
    for _r in range(rounds):
        for i in range(n):
            for k in range(n):
                aik = a[i * n + k]
                for j in range(n):
                    c[i * n + j] = c[i * n + j] + aik * b[k * n + j]
    s = 0.0
    for i in range(n * n):
        s += c[i]
    return int(s * 1000.0)


print(run(N, ROUNDS))
