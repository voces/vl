# Struct field read/write in a tight loop, flat and nested. See main.vl.
#
# Idiomatic Python: plain classes with instance attributes (a dict-or-slots
# lookup per field access). N and M are REDUCED by 200x (see meta.json nPython /
# expectPython).


class V3:
    def __init__(self, x, y, z):
        self.x = x
        self.y = y
        self.z = z


class Body:
    def __init__(self, pos, vel, mass):
        self.pos = pos
        self.vel = vel
        self.mass = mass


def main():
    n = 1_500_000
    m = 1_000_000

    p = V3(1, 2, 3)
    acc = 0
    i = 0
    while i < n:
        p.x = (p.x + 3) & 1023
        p.y = (p.y + p.x) & 1023
        p.z = (p.z + p.y) & 1023
        acc += p.z
        i += 1

    b = Body(V3(1, 2, 3), V3(5, 7, 11), 1)
    acc2 = 0
    i = 0
    while i < m:
        b.pos.x = (b.pos.x + b.vel.x) & 1023
        b.pos.y = (b.pos.y + b.vel.y) & 1023
        b.pos.z = (b.pos.z + b.vel.z) & 1023
        b.vel.x = (b.vel.x + 1) & 63
        acc2 += b.pos.x + b.pos.y + b.pos.z
        i += 1

    print(p.x)
    print(p.y)
    print(p.z)
    print(acc)
    print(b.pos.x)
    print(b.vel.x)
    print(acc2)


main()
