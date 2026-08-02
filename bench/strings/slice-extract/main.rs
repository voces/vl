// slice-extract — see main.vl
// STRUCTURAL NOTE: `&s[i..i + W]` is a borrow of the existing UTF-8 buffer —
// no allocation and no copy. Rust therefore pays only the hash here, which is
// exactly the structural advantage being measured.
const ALPHA: &str = "abcdefghijklmnopqrstuvwxyz";

const LEN: usize = 200_000;
const W: usize = 12;
const PASSES: usize = 180;

fn build_input(n: usize) -> String {
    let mut chunk = String::new();
    for i in 0..1024usize {
        let k = (i * 31 + (i / 7) * 17) % 26;
        chunk.push_str(&ALPHA[k..k + 1]);
    }
    let mut s = chunk;
    while s.len() < n {
        let t = s.clone();
        s.push_str(&t);
    }
    s.truncate(n);
    s
}

fn main() {
    let s = build_input(LEN);
    let mut acc: i64 = 0;
    for _ in 0..PASSES {
        let limit = s.len() - W;
        for i in 0..=limit {
            let t = &s[i..i + W];
            let tb = t.as_bytes();
            let mut h: i64 = 0;
            for j in 0..W {
                h = (h * 31 + tb[j] as i64) % 1_000_003;
            }
            acc += h;
        }
    }
    println!("{}", acc);
}
