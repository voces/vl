// Word frequency — the classic mixed map + string benchmark. See main.vl.
//
// Idiomatic Rust: `HashMap<String, i32>` (default SipHash-1-3) counted with the
// canonical `*freq.entry(w.to_string()).or_insert(0) += 1` line. That allocates a
// fresh `String` per token, matching what VL/JS/Python must do; Rust could avoid
// the allocation with a `get_mut`/`insert` dance over the borrowed `&str`, which
// is a structural advantage the other three do not have.
use std::collections::HashMap;

fn main() {
    let v: usize = 2_000;
    let d: usize = 4_000;
    let k: usize = 20;
    let r = 120;

    let mut vocab: Vec<String> = Vec::new();
    for i in 0..v {
        vocab.push(format!("w{}", i));
    }

    // MINSTD LCG; every product stays under 2^53 so JS doubles are exact too.
    let mut seed: i64 = 42;
    let mut docs: Vec<String> = Vec::new();
    for _ in 0..d {
        let mut doc = String::new();
        for j in 0..k {
            seed = (seed * 48271) % 2147483647;
            let t = (seed % (v as i64)) as usize;
            let idx = (t * t) / v;
            if j > 0 {
                doc.push(' ');
            }
            doc.push_str(&vocab[idx]);
        }
        docs.push(doc);
    }

    let mut freq: HashMap<String, i32> = HashMap::new();
    let mut tokens: i64 = 0;
    for _ in 0..r {
        for i in 0..d {
            let doc = &docs[i];
            let bytes = doc.as_bytes();
            let mut start = 0usize;
            let mut j = 0usize;
            while j < bytes.len() {
                if bytes[j] == b' ' {
                    if j > start {
                        let w = &doc[start..j];
                        *freq.entry(w.to_string()).or_insert(0) += 1;
                        tokens += 1;
                    }
                    start = j + 1;
                }
                j += 1;
            }
            if j > start {
                let w = &doc[start..j];
                *freq.entry(w.to_string()).or_insert(0) += 1;
                tokens += 1;
            }
        }
    }

    let mut max_count = 0i32;
    let mut checksum: i64 = 0;
    for i in 0..v {
        let c = freq.get(&vocab[i]).copied().unwrap_or(0);
        if c > max_count {
            max_count = c;
        }
        checksum += (c as i64) * ((i + 1) as i64);
    }

    println!("{}", freq.len());
    println!("{}", tokens);
    println!("{}", max_count);
    println!("{}", checksum);
}
