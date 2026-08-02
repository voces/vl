// substr-search — see main.vl
// `str::find` is the two-way algorithm with a memchr-accelerated first-byte
// skip loop; that is exactly the structural advantage being measured.
const ALPHA: &str = "abcdefghijklmnopqrstuvwxyz";

const LEN: usize = 1_000_000;
const NEEDLE_W: usize = 12;
const NN: usize = 16;
const PASSES: usize = 60;

fn build_input(n: usize) -> String {
    let mut chunk = String::new();
    for i in 0..16_384usize {
        let k = (i * 31 + (i / 7) * 17 + (i / 601) * 5) % 26;
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
    let mut needles: Vec<String> = Vec::new();
    for k in 0..NN {
        let off = k * 977;
        let t = &s[off..off + NEEDLE_W];
        if k % 2 == 1 {
            needles.push(format!("{}{}{}", &t[0..6], "Q", &t[7..NEEDLE_W]));
        } else {
            needles.push(t.to_string());
        }
    }
    let mut acc: i64 = 0;
    for _ in 0..PASSES {
        for q in 0..NN {
            acc += match s.find(needles[q].as_str()) {
                Some(i) => i as i64,
                None => -1,
            };
        }
    }
    println!("{}", acc);
}
