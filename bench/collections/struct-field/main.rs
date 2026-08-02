// Struct field read/write in a tight loop, flat and nested. See main.vl.
//
// Idiomatic Rust: plain mutable structs. Rust's structural advantage here is
// total — a non-escaping local struct is SROA'd into registers, so there is no
// memory traffic at all; VL's WasmGC struct and JS's object are real heap cells.

struct V3 {
    x: i32,
    y: i32,
    z: i32,
}

struct Body {
    pos: V3,
    vel: V3,
    #[allow(dead_code)]
    mass: i32,
}

fn main() {
    let n: i64 = 300_000_000;
    let m: i64 = 200_000_000;

    let mut p = V3 { x: 1, y: 2, z: 3 };
    let mut acc: i64 = 0;
    let mut i: i64 = 0;
    while i < n {
        p.x = (p.x + 3) & 1023;
        p.y = (p.y + p.x) & 1023;
        p.z = (p.z + p.y) & 1023;
        acc += p.z as i64;
        i += 1;
    }

    let mut b = Body {
        pos: V3 { x: 1, y: 2, z: 3 },
        vel: V3 { x: 5, y: 7, z: 11 },
        mass: 1,
    };
    let mut acc2: i64 = 0;
    i = 0;
    while i < m {
        b.pos.x = (b.pos.x + b.vel.x) & 1023;
        b.pos.y = (b.pos.y + b.vel.y) & 1023;
        b.pos.z = (b.pos.z + b.vel.z) & 1023;
        b.vel.x = (b.vel.x + 1) & 63;
        acc2 += (b.pos.x + b.pos.y + b.pos.z) as i64;
        i += 1;
    }

    println!("{}", p.x);
    println!("{}", p.y);
    println!("{}", p.z);
    println!("{}", acc);
    println!("{}", b.pos.x);
    println!("{}", b.vel.x);
    println!("{}", acc2);
}
