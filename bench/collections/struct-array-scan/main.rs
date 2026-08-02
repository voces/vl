// An array of structs, scanned by field. See main.vl.
//
// Idiomatic Rust: `Vec<Rec>` — the records live INLINE in one contiguous
// allocation, so a scan is a linear stream with hardware prefetch and no pointer
// chase. That is a structural layout advantage the other three cannot express.

#[derive(Clone, Copy)]
struct Rec {
    #[allow(dead_code)]
    id: i32,
    a: i32,
    b: i32,
    c: i32,
}

fn main() {
    let n: i32 = 2_000_000;
    let r = 100;

    let mut recs: Vec<Rec> = Vec::new();
    for i in 0..n {
        recs.push(Rec {
            id: i,
            a: i & 7,
            b: (i * 3) & 65535,
            c: (i * 7) & 4095,
        });
    }

    let mut sum_b: i64 = 0;
    let mut cnt: i64 = 0;
    let mut sum_c: i64 = 0;
    for _ in 0..r {
        for i in 0..(n as usize) {
            let rec = &recs[i];
            sum_b += rec.b as i64;
            if rec.a == 0 {
                cnt += 1;
                sum_c += rec.c as i64;
            }
        }
    }

    println!("{}", recs.len());
    println!("{}", sum_b);
    println!("{}", cnt);
    println!("{}", sum_c);
}
