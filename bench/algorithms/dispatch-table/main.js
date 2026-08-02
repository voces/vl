// dispatch-table — function values called INDIRECTLY, the shape every plugin
// registry / interpreter / state machine has:
//
//   phase 1  an if/else chain calling the four operations directly — the floor
//   phase 2  the four operations in an ARRAY of function values, indexed
//   phase 3  the four operations in a FIELD of an object, in an array of them
//
// Idiomatic JS.

function op0(x) { return (x + 1) & 15; }
function op1(x) { return (x + 2) & 15; }
function op2(x) { return (x * 3) & 15; }
function op3(x) { return (x ^ 5) & 15; }

function main() {
  const n = Number(Deno.args[0] ?? 50000000);
  const mask = 1048575;

  // phase 1 — an if/else chain, direct calls
  let a1 = 0;
  for (let i = 0; i < n; i++) {
    const k = i & 3;
    let v;
    if (k === 0) v = op0(i);
    else if (k === 1) v = op1(i);
    else if (k === 2) v = op2(i);
    else v = op3(i);
    a1 = (a1 + v) & mask;
  }
  console.log(a1);

  // phase 2 — an array of function values
  const fs = [op0, op1, op2, op3];
  let a2 = 0;
  for (let i = 0; i < n; i++) {
    a2 = (a2 + fs[i & 3](i)) & mask;
  }
  console.log(a2);

  // phase 3 — a function value in an object FIELD
  const ops = [
    { f: op0, name: "add1" },
    { f: op1, name: "add2" },
    { f: op2, name: "mul3" },
    { f: op3, name: "xor5" },
  ];
  let a3 = 0;
  for (let i = 0; i < n; i++) {
    a3 = (a3 + ops[i & 3].f(i)) & mask;
  }
  console.log(a3);
}

main();
