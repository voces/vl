// str-eq — see main.vl
const ALPHA = "abcdefghijklmnopqrstuvwxyz";

const LEN = 64;
const GROUPS = 8;
const REPS = 6000000;

function mk(seed, flip) {
  let s = "";
  for (let i = 0; i < LEN; i++) {
    let k = (i * 7 + seed * 13) % 26;
    if (i === flip) k = (k + 1) % 26;
    s = s + ALPHA.slice(k, k + 1);
  }
  return s;
}

function main() {
  const base = [], ident = [], copy = [], first = [], last = [];
  for (let j = 0; j < GROUPS; j++) {
    base.push(mk(j, -1));
    copy.push(mk(j, -1));
    if (j % 2 === 0) first.push(mk(j, -1)); else first.push(mk(j, 0));
    if (j < 5) last.push(mk(j, -1)); else last.push(mk(j, LEN - 1));
  }
  for (let j = 0; j < GROUPS; j++) ident.push(base[j]);

  let cA = 0;
  for (let i = 0; i < REPS; i++) {
    const q = i % GROUPS;
    if (base[q] === ident[q]) cA = cA + 1;
  }
  let cB = 0;
  for (let i = 0; i < REPS; i++) {
    const q = i % GROUPS;
    if (base[q] === copy[q]) cB = cB + 1;
  }
  let cC = 0;
  for (let i = 0; i < REPS; i++) {
    const q = i % GROUPS;
    if (base[q] === first[q]) cC = cC + 1;
  }
  let cD = 0;
  for (let i = 0; i < REPS; i++) {
    const q = i % GROUPS;
    if (base[q] === last[q]) cD = cD + 1;
  }
  console.log(cA);
  console.log(cB);
  console.log(cC);
  console.log(cD);
}

main();
