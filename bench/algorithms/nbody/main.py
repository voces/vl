# n-body — adapted from the Computer Language Benchmarks Game `nbody` program
# (the classic 5-body Jovian-planets simulation, Mark C. Lewis' shape).
# Idiomatic Python: a list of small mutable objects, index loops. No numpy
# (numpy would measure C, not Python).
#
# ADAPTATION: prints through the same integer-scaling fmt9 as the other three
# languages instead of "%.9f", so all four outputs are identical by
# construction.

import sys
from math import sqrt


class Body:
    __slots__ = ("x", "y", "z", "vx", "vy", "vz", "mass")

    def __init__(self, x, y, z, vx, vy, vz, mass):
        self.x = x
        self.y = y
        self.z = z
        self.vx = vx
        self.vy = vy
        self.vz = vz
        self.mass = mass


def fmt9(v):
    sign = ""
    a = v
    if v < 0.0:
        sign = "-"
        a = -v
    scaled = int(a * 1000000000.0 + 0.5)
    ip = scaled // 1000000000
    fp = scaled % 1000000000
    return sign + str(ip) + "." + str(fp).rjust(9, "0")


def make_bodies():
    pi = 3.141592653589793
    solar_mass = 4.0 * pi * pi
    days_per_year = 365.24
    return [
        # Sun
        Body(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, solar_mass),
        # Jupiter
        Body(
            4.84143144246472090,
            -1.16032004402742839,
            -0.103622044471123109,
            0.00166007664274403694 * days_per_year,
            0.00769901118419740425 * days_per_year,
            -0.0000690460016972063023 * days_per_year,
            0.000954791938424326609 * solar_mass,
        ),
        # Saturn
        Body(
            8.34336671824457987,
            4.12479856412430479,
            -0.403523417114321381,
            -0.00276742510726862411 * days_per_year,
            0.00499852801234917238 * days_per_year,
            0.0000230417297573763929 * days_per_year,
            0.000285885980666130812 * solar_mass,
        ),
        # Uranus
        Body(
            12.8943695621391310,
            -15.1111514016986312,
            -0.223307578892655734,
            0.00296460137564761618 * days_per_year,
            0.00237847173959480950 * days_per_year,
            -0.0000296589568540237556 * days_per_year,
            0.0000436624404335156298 * solar_mass,
        ),
        # Neptune
        Body(
            15.3796971148509165,
            -25.9193146099879641,
            0.179258772950371181,
            0.00268067772490389322 * days_per_year,
            0.00162824170038242295 * days_per_year,
            -0.0000951592254519715870 * days_per_year,
            0.0000515138902046611451 * solar_mass,
        ),
    ]


def offset_momentum(bodies):
    pi = 3.141592653589793
    solar_mass = 4.0 * pi * pi
    px = py = pz = 0.0
    for b in bodies:
        px += b.vx * b.mass
        py += b.vy * b.mass
        pz += b.vz * b.mass
    bodies[0].vx = -px / solar_mass
    bodies[0].vy = -py / solar_mass
    bodies[0].vz = -pz / solar_mass


def energy(bodies):
    e = 0.0
    n = len(bodies)
    for i in range(n):
        bi = bodies[i]
        e += 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy + bi.vz * bi.vz)
        for j in range(i + 1, n):
            bj = bodies[j]
            dx = bi.x - bj.x
            dy = bi.y - bj.y
            dz = bi.z - bj.z
            d = sqrt(dx * dx + dy * dy + dz * dz)
            e -= (bi.mass * bj.mass) / d
    return e


def advance(bodies, dt):
    n = len(bodies)
    for i in range(n):
        bi = bodies[i]
        for j in range(i + 1, n):
            bj = bodies[j]
            dx = bi.x - bj.x
            dy = bi.y - bj.y
            dz = bi.z - bj.z
            d2 = dx * dx + dy * dy + dz * dz
            mag = dt / (d2 * sqrt(d2))
            mj = bj.mass * mag
            mi = bi.mass * mag
            bi.vx -= dx * mj
            bi.vy -= dy * mj
            bi.vz -= dz * mj
            bj.vx += dx * mi
            bj.vy += dy * mi
            bj.vz += dz * mi
    for b in bodies:
        b.x += dt * b.vx
        b.y += dt * b.vy
        b.z += dt * b.vz


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 500000
    bodies = make_bodies()
    offset_momentum(bodies)
    print(fmt9(energy(bodies)))
    for _ in range(n):
        advance(bodies, 0.01)
    print(fmt9(energy(bodies)))


main()
