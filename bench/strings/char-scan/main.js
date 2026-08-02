// char-scan — see main.vl
const ALPHA = "abcdefghijklmnopqrstuvwxyz";

const LEN = 1000000;
const PASSES = 600;

function buildInput(n) {
  let chunk = "";
  for (let i = 0; i < 1024; i++) {
    if (i % 9 === 8) {
      chunk = chunk + " ";
    } else {
      const k = (i * 31 + Math.trunc(i / 7) * 17) % 26;
      chunk = chunk + ALPHA.slice(k, k + 1);
    }
  }
  let s = chunk;
  while (s.length < n) s = s + s;
  return s.slice(0, n);
}

function main() {
  const s = buildInput(LEN);
  let acc = 0;
  let vowels = 0;
  for (let r = 0; r < PASSES; r++) {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      acc = acc + c;
      if (c === 97 || c === 101 || c === 105 || c === 111 || c === 117) {
        vowels = vowels + 1;
      }
    }
  }
  console.log(acc);
  console.log(vowels);
}

main();
