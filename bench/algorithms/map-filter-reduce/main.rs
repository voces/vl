// map-filter-reduce — callback-heavy pipeline over a large array, in the
// three spellings a programmer actually chooses between:
//
//   phase A  the iterator adapters:  iter().map(f).filter(g) -> Vec, then fold
//   phase B  hand-written loops that build the SAME two intermediate Vecs
//   phase C  one fused hand-written loop, no intermediate Vecs
//
// Idiomatic safe Rust. Phase A collects into a Vec at each stage rather than
// fusing the whole chain lazily, so it allocates exactly what phase B does —
// otherwise Rust's lazy iterators would be measuring a different program from
// the other three languages.

fn main() {
    let n: i32 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(20_000_000);

    let mut xs: Vec<i32> = Vec::new();
    let mut i = 0;
    while i < n {
        xs.push(i & 1023);
        i += 1;
    }

    // phase A — iterator adapters with closure callbacks
    let ys: Vec<i32> = xs.iter().map(|x| x * 3 + 1).collect();
    let zs: Vec<i32> = ys.iter().filter(|y| (*y & 7) == 3).cloned().collect();
    let total_a: i64 = zs.iter().fold(0i64, |acc, z| acc + *z as i64);
    println!("{}", total_a);

    // phase B — hand-written loops building the same two intermediate Vecs
    let mut ys2: Vec<i32> = Vec::new();
    let mut b = 0usize;
    while b < xs.len() {
        ys2.push(xs[b] * 3 + 1);
        b += 1;
    }
    let mut zs2: Vec<i32> = Vec::new();
    let mut c = 0usize;
    while c < ys2.len() {
        let y = ys2[c];
        if (y & 7) == 3 {
            zs2.push(y);
        }
        c += 1;
    }
    let mut total_b: i64 = 0;
    let mut d = 0usize;
    while d < zs2.len() {
        total_b += zs2[d] as i64;
        d += 1;
    }
    println!("{}", total_b);

    // phase C — one fused loop, no intermediates
    let mut total_c: i64 = 0;
    let mut e = 0usize;
    while e < xs.len() {
        let y = xs[e] * 3 + 1;
        if (y & 7) == 3 {
            total_c += y as i64;
        }
        e += 1;
    }
    println!("{}", total_c);
}
