// String-keyed map. See main.vl for the shape.
//
// Idiomatic Rust: std `HashMap<String, i32>` with the DEFAULT hasher (SipHash-1-3).
// Swapping in FxHash/ahash would be considerably faster but is a third-party
// library change, so it is deliberately not done here — noted as a structural
// handicap instead.
use std::collections::HashMap;

fn main() {
    let n: usize = 100_000;
    let r = 150;
    let total = 2 * n;

    let mut ins_keys: Vec<String> = Vec::new();
    for i in 0..n {
        ins_keys.push(format!("key{}", i));
    }
    // Distinct allocations, equal content for the first n.
    let mut probe: Vec<String> = Vec::new();
    for i in 0..total {
        probe.push(format!("key{}", i));
    }

    let mut m: HashMap<String, i32> = HashMap::new();
    for i in 0..n {
        m.insert(ins_keys[i].clone(), (i as i32) * 3 + 1);
    }

    let mut hits: i64 = 0;
    let mut misses: i64 = 0;
    for _ in 0..r {
        for i in 0..total {
            let v = m.get(&probe[i]).copied().unwrap_or(-1);
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
