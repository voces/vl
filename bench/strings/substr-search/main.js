// substr-search — see main.vl
const ALPHA = "abcdefghijklmnopqrstuvwxyz";

const LEN = 1000000;
const NEEDLE_W = 12;
const NN = 16;
const PASSES = 60;

function buildInput(n) {
  let chunk = "";
  for (let i = 0; i < 16384; i++) {
    const k = (i * 31 + Math.trunc(i / 7) * 17 + Math.trunc(i / 601) * 5) % 26;
    chunk = chunk + ALPHA.slice(k, k + 1);
  }
  let s = chunk;
  while (s.length < n) s = s + s;
  return s.slice(0, n);
}

function main() {
  const s = buildInput(LEN);
  const needles = [];
  for (let k = 0; k < NN; k++) {
    const off = k * 977;
    const t = s.slice(off, off + NEEDLE_W);
    if (k % 2 === 1) {
      needles.push(t.slice(0, 6) + "Q" + t.slice(7, NEEDLE_W));
    } else {
      needles.push(t);
    }
  }
  let acc = 0;
  for (let r = 0; r < PASSES; r++) {
    for (let q = 0; q < NN; q++) {
      acc = acc + s.indexOf(needles[q]);
    }
  }
  console.log(acc);
}

main();
