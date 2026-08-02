// i32-keyed map. Same skeleton as ../map-string with the key type changed.
//
// Idiomatic Rust: std `HashMap<i32, i32>` with the DEFAULT hasher (SipHash-1-3).
// SipHash over a 4-byte key is a real handicap here relative to Python (whose
// int hash is the identity) and to VL (an integer mix); swapping the hasher is a
// third-party library change, so it is deliberately not done.
use std::collections::HashMap;

fn main() {
    let n: i32 = 200_000;
    let r = 100;
    let total = 2 * n;

    let mut probe: Vec<i32> = Vec::new();
    for i in 0..n {
        probe.push(i * 7 + 3);
    }
    for i in 0..n {
        probe.push(i * 7 + 4);
    }

    let mut m: HashMap<i32, i32> = HashMap::new();
    for i in 0..n {
        m.insert(i * 7 + 3, i * 3 + 1);
    }

    let mut hits: i64 = 0;
    let mut misses: i64 = 0;
    for _ in 0..r {
        for i in 0..total {
            let v = m.get(&probe[i as usize]).copied().unwrap_or(-1);
            if v == -1 {
                misses += 1;
            } else {
                hits += v as i64;
            }
        }
    }

    let mut iter: i64 = 0;
    for v in m.values() {
        iter += *v as i64;
    }

    println!("{}", m.len());
    println!("{}", hits);
    println!("{}", misses);
    println!("{}", iter);
}
