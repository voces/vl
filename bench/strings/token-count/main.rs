// token-count — see main.vl
// The state machine is hand-written to match the other three exactly.
// `s.split_whitespace()` would be the idiomatic Rust one-liner; it is measured
// separately (see meta.json notes) rather than substituted here, because that
// would change the algorithm.
const ALPHA: &str = "abcdefghijklmnopqrstuvwxyz";

const LEN: usize = 1_000_000;
const PASSES: usize = 1_000;

fn build_input(n: usize) -> String {
    let mut chunk = String::new();
    for i in 0..1024usize {
        if (i * 7 + i / 5) % 11 == 0 {
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
    let mut tokens: i64 = 0;
    let mut total_len: i64 = 0;
    let mut max_len: i64 = 0;
    for _ in 0..PASSES {
        let mut in_tok = false;
        let mut cur_len: i64 = 0;
        for &c in s.as_bytes() {
            if c == 32 {
                if in_tok {
                    tokens += 1;
                    total_len += cur_len;
                    if cur_len > max_len { max_len = cur_len; }
                    in_tok = false;
                    cur_len = 0;
                }
            } else {
                in_tok = true;
                cur_len += 1;
            }
        }
        if in_tok {
            tokens += 1;
            total_len += cur_len;
            if cur_len > max_len { max_len = cur_len; }
        }
    }
    println!("{}", tokens);
    println!("{}", total_len);
    println!("{}", max_len);
}
