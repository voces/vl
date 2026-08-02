// concat-build — see main.vl
// NOTE: `String + &str` in Rust consumes the left operand and appends in
// place (amortised O(1)), so this IS the idiomatic append spelling, not a
// hand optimisation. `String` is UTF-8; the input is ASCII.
const ALPHA: &str = "abcdefghijklmnopqrstuvwxyz";

const N: usize = 5_000;
const REPS: usize = 1_000;

fn main() {
    let mut total: i64 = 0;
    for r in 0..REPS {
        let mut s = String::new();
        for i in 0..N {
            let k = (i + r) % 26;
            s = s + &ALPHA[k..k + 1];
        }
        total += s.len() as i64 + s.as_bytes()[s.len() - 1] as i64;
    }
    println!("{}", total);
}
