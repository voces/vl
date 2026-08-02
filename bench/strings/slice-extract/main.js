// slice-extract — see main.vl
const ALPHA = "abcdefghijklmnopqrstuvwxyz";

const LEN = 200000;
const W = 12;
const PASSES = 180;

function buildInput(n) {
  let chunk = "";
  for (let i = 0; i < 1024; i++) {
    const k = (i * 31 + Math.trunc(i / 7) * 17) % 26;
    chunk = chunk + ALPHA.slice(k, k + 1);
  }
  let s = chunk;
  while (s.length < n) s = s + s;
  return s.slice(0, n);
}

function main() {
  const s = buildInput(LEN);
  let acc = 0;
  for (let r = 0; r < PASSES; r++) {
    const limit = s.length - W;
    for (let i = 0; i <= limit; i++) {
      const t = s.slice(i, i + W);
      let h = 0;
      for (let j = 0; j < W; j++) {
        h = (h * 31 + t.charCodeAt(j)) % 1000003;
      }
      acc = acc + h;
    }
  }
  console.log(acc);
}

main();
