// str-eq — see main.vl
// STRUCTURAL NOTE: Rust `String`/`str` equality is length check + memcmp on
// the UTF-8 bytes. There is no object-identity shortcut in the source
// language, so phase A costs the same as phase B here by construction —
// that is a real difference from VL / JS / CPython, not a measurement flaw.
const ALPHA: &str = "abcdefghijklmnopqrstuvwxyz";

const LEN: usize = 64;
const GROUPS: usize = 8;
const REPS: usize = 6_000_000;

fn mk(seed: usize, flip: i64) -> String {
    let mut s = String::new();
    for i in 0..LEN {
        let mut k = (i * 7 + seed * 13) % 26;
        if i as i64 == flip {
            k = (k + 1) % 26;
        }
        s = s + &ALPHA[k..k + 1];
    }
    s
}

fn main() {
    let mut base: Vec<String> = Vec::new();
    let mut copy: Vec<String> = Vec::new();
    let mut first: Vec<String> = Vec::new();
    let mut last: Vec<String> = Vec::new();
    for j in 0..GROUPS {
        base.push(mk(j, -1));
        copy.push(mk(j, -1));
        if j % 2 == 0 { first.push(mk(j, -1)); } else { first.push(mk(j, 0)); }
        if j < 5 { last.push(mk(j, -1)); } else { last.push(mk(j, LEN as i64 - 1)); }
    }
    let mut ident: Vec<&str> = Vec::new();
    for j in 0..GROUPS {
        ident.push(&base[j]);
    }

    let mut c_a: i64 = 0;
    for i in 0..REPS {
        let q = i % GROUPS;
        if base[q] == ident[q] { c_a += 1; }
    }
    let mut c_b: i64 = 0;
    for i in 0..REPS {
        let q = i % GROUPS;
        if base[q] == copy[q] { c_b += 1; }
    }
    let mut c_c: i64 = 0;
    for i in 0..REPS {
        let q = i % GROUPS;
        if base[q] == first[q] { c_c += 1; }
    }
    let mut c_d: i64 = 0;
    for i in 0..REPS {
        let q = i % GROUPS;
        if base[q] == last[q] { c_d += 1; }
    }
    println!("{}", c_a);
    println!("{}", c_b);
    println!("{}", c_c);
    println!("{}", c_d);
}
