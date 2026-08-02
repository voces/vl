// int-format — see main.vl
// `v.to_string()` allocates a fresh UTF-8 String per call, matching what the
// other three do.
const N: i64 = 30_000_000;

fn main() {
    let mut total_len: i64 = 0;
    let mut acc: i64 = 0;
    let mut v: i32 = 1;
    for i in 0..N {
        v = (v * 31 + 17) % 999_983;
        let mut out = v;
        if i % 5 == 0 {
            out = 0 - out;
        }
        let s = out.to_string();
        total_len += s.len() as i64;
        for &c in s.as_bytes() {
            acc += c as i64;
        }
    }
    println!("{}", total_len);
    println!("{}", acc);
}
