// char-scan — see main.vl
// NOTE: Rust `String` is UTF-8; the input is pure ASCII, so `as_bytes()`
// yields exactly the same sequence of code points VL's `s[i]` does.
const ALPHA: &str = "abcdefghijklmnopqrstuvwxyz";

const LEN: usize = 1_000_000;
const PASSES: usize = 600;

fn build_input(n: usize) -> String {
    let mut chunk = String::new();
    for i in 0..1024usize {
        if i % 9 == 8 {
            chunk.push_str(" ");
        } else {
            let k = (i * 31 + (i / 7) * 17) % 26;
            chunk.push_str(&ALPHA[k..k + 1]);
        }
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
    let mut vowels: i64 = 0;
    for _ in 0..PASSES {
        for &c in s.as_bytes() {
            acc += c as i64;
            if c == 97 || c == 101 || c == 105 || c == 111 || c == 117 {
                vowels += 1;
            }
        }
    }
    println!("{}", acc);
    println!("{}", vowels);
}
