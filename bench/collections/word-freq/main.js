// Word frequency — the classic mixed map + string benchmark. See main.vl.
//
// Idiomatic JS: a `Map` keyed by the sliced token string, counted with a
// get-then-set upsert (JS has no single-probe upsert either).
function main() {
  const v = 2_000;
  const d = 4_000;
  const k = 20;
  const r = 120;

  const vocab = [];
  for (let i = 0; i < v; i++) {
    vocab.push("w" + i);
  }

  // MINSTD LCG; every product stays under 2^53 so doubles are exact.
  let seed = 42;
  const docs = [];
  for (let i = 0; i < d; i++) {
    let doc = "";
    for (let j = 0; j < k; j++) {
      seed = (seed * 48271) % 2147483647;
      const t = seed % v;
      const idx = Math.floor((t * t) / v);
      if (j > 0) {
        doc = doc + " ";
      }
      doc = doc + vocab[idx];
    }
    docs.push(doc);
  }

  const freq = new Map();
  let tokens = 0;
  for (let pass = 0; pass < r; pass++) {
    for (let i = 0; i < d; i++) {
      const doc = docs[i];
      let start = 0;
      let j = 0;
      while (j < doc.length) {
        if (doc.charCodeAt(j) === 32) {
          if (j > start) {
            const w = doc.slice(start, j);
            freq.set(w, (freq.get(w) ?? 0) + 1);
            tokens += 1;
          }
          start = j + 1;
        }
        j += 1;
      }
      if (j > start) {
        const w = doc.slice(start, j);
        freq.set(w, (freq.get(w) ?? 0) + 1);
        tokens += 1;
      }
    }
  }

  let maxCount = 0;
  let checksum = 0;
  for (let i = 0; i < v; i++) {
    const c = freq.get(vocab[i]) ?? 0;
    if (c > maxCount) {
      maxCount = c;
    }
    checksum += c * (i + 1);
  }

  console.log(freq.size);
  console.log(tokens);
  console.log(maxCount);
  console.log(checksum);
}
main();
