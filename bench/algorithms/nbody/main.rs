// n-body — adapted from the Computer Language Benchmarks Game `nbody` program
// (the classic 5-body Jovian-planets simulation, Mark C. Lewis' shape).
// Idiomatic safe Rust: a fixed array of Body structs, index loops, no unsafe,
// no SIMD, no hand-unrolling.
//
// ADAPTATION: prints through the same integer-scaling fmt9 as the other three
// languages instead of `{:.9}`, so all four outputs are identical by
// construction.

#[derive(Clone, Copy)]
struct Body {
    x: f64,
    y: f64,
    z: f64,
    vx: f64,
    vy: f64,
    vz: f64,
    mass: f64,
}

fn fmt9(v: f64) -> String {
    let (sign, a) = if v < 0.0 { ("-", -v) } else { ("", v) };
    let scaled = (a * 1000000000.0 + 0.5) as i64;
    let ip = scaled / 1000000000;
    let fp = scaled % 1000000000;
    format!("{}{}.{:09}", sign, ip, fp)
}

fn make_bodies() -> Vec<Body> {
    let pi = 3.141592653589793f64;
    let solar_mass = 4.0 * pi * pi;
    let days_per_year = 365.24f64;
    vec![
        // Sun
        Body { x: 0.0, y: 0.0, z: 0.0, vx: 0.0, vy: 0.0, vz: 0.0, mass: solar_mass },
        // Jupiter
        Body {
            x: 4.84143144246472090,
            y: -1.16032004402742839,
            z: -0.103622044471123109,
            vx: 0.00166007664274403694 * days_per_year,
            vy: 0.00769901118419740425 * days_per_year,
            vz: -0.0000690460016972063023 * days_per_year,
            mass: 0.000954791938424326609 * solar_mass,
        },
        // Saturn
        Body {
            x: 8.34336671824457987,
            y: 4.12479856412430479,
            z: -0.403523417114321381,
            vx: -0.00276742510726862411 * days_per_year,
            vy: 0.00499852801234917238 * days_per_year,
            vz: 0.0000230417297573763929 * days_per_year,
            mass: 0.000285885980666130812 * solar_mass,
        },
        // Uranus
        Body {
            x: 12.8943695621391310,
            y: -15.1111514016986312,
            z: -0.223307578892655734,
            vx: 0.00296460137564761618 * days_per_year,
            vy: 0.00237847173959480950 * days_per_year,
            vz: -0.0000296589568540237556 * days_per_year,
            mass: 0.0000436624404335156298 * solar_mass,
        },
        // Neptune
        Body {
            x: 15.3796971148509165,
            y: -25.9193146099879641,
            z: 0.179258772950371181,
            vx: 0.00268067772490389322 * days_per_year,
            vy: 0.00162824170038242295 * days_per_year,
            vz: -0.0000951592254519715870 * days_per_year,
            mass: 0.0000515138902046611451 * solar_mass,
        },
    ]
}

fn offset_momentum(bodies: &mut Vec<Body>) {
    let pi = 3.141592653589793f64;
    let solar_mass = 4.0 * pi * pi;
    let mut px = 0.0;
    let mut py = 0.0;
    let mut pz = 0.0;
    for b in bodies.iter() {
        px += b.vx * b.mass;
        py += b.vy * b.mass;
        pz += b.vz * b.mass;
    }
    bodies[0].vx = -px / solar_mass;
    bodies[0].vy = -py / solar_mass;
    bodies[0].vz = -pz / solar_mass;
}

fn energy(bodies: &Vec<Body>) -> f64 {
    let mut e = 0.0;
    let n = bodies.len();
    for i in 0..n {
        let bi = bodies[i];
        e += 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy + bi.vz * bi.vz);
        for j in (i + 1)..n {
            let bj = bodies[j];
            let dx = bi.x - bj.x;
            let dy = bi.y - bj.y;
            let dz = bi.z - bj.z;
            let d = (dx * dx + dy * dy + dz * dz).sqrt();
            e -= bi.mass * bj.mass / d;
        }
    }
    e
}

fn advance(bodies: &mut Vec<Body>, dt: f64) {
    let n = bodies.len();
    for i in 0..n {
        for j in (i + 1)..n {
            let bi = bodies[i];
            let bj = bodies[j];
            let dx = bi.x - bj.x;
            let dy = bi.y - bj.y;
            let dz = bi.z - bj.z;
            let d2 = dx * dx + dy * dy + dz * dz;
            let mag = dt / (d2 * d2.sqrt());
            let mj = bj.mass * mag;
            let mi = bi.mass * mag;
            bodies[i].vx -= dx * mj;
            bodies[i].vy -= dy * mj;
            bodies[i].vz -= dz * mj;
            bodies[j].vx += dx * mi;
            bodies[j].vy += dy * mi;
            bodies[j].vz += dz * mi;
        }
    }
    for b in bodies.iter_mut() {
        b.x += dt * b.vx;
        b.y += dt * b.vy;
        b.z += dt * b.vz;
    }
}

fn main() {
    let n: i32 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(50_000_000);
    let mut bodies = make_bodies();
    offset_momentum(&mut bodies);
    println!("{}", fmt9(energy(&bodies)));
    for _ in 0..n {
        advance(&mut bodies, 0.01);
    }
    println!("{}", fmt9(energy(&bodies)));
}
