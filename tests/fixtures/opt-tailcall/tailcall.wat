;; A wasm `return_call` in tail position — the shape `compiler/*.vl` emits once
;; the tail-call slice lands (perf-landscape.md P1).
;;
;; This fixture exists because binaryen HARD-FAILS validation on `return_call`
;; unless `--enable-tail-call` is passed: `wasm-opt` exits 1 with
;; "Fatal: error validating input" and writes NO output file, so `vl build -O`
;; would bail on every tail-recursive program. The enable lives in
;; `BINARYEN_FEATURES`, shared by both rungs and by `--wat`, and this is what
;; proves it is still there.
;;
;; It is written as `.wat` rather than `.vl` deliberately: the gate has to hold
;; from the commit that adds the enable, which is BEFORE the emitter starts
;; producing the opcode. A `.vl` fixture would compile to a plain `call` and pass
;; whether or not the feature is enabled — an inert gate for exactly as long as
;; it matters. Assembled at test time with `wasm-as`.
;;
;; digest(n, acc): tail-recursive sum of 1..n, printed. n = 100 -> 5050.
(module
 (type $print (func (param i32)))
 (type $digest (func (param i32 i32) (result i32)))
 (type $start (func))
 (import "imports" "__print_i32__" (func $print (type $print) (param i32)))
 (start $main)
 (func $digest (type $digest) (param $n i32) (param $acc i32) (result i32)
  (if (i32.eqz (local.get $n))
   (then (return (local.get $acc)))
  )
  (return_call $digest
   (i32.sub (local.get $n) (i32.const 1))
   (i32.add (local.get $acc) (local.get $n))
  )
 )
 (func $main (type $start)
  (call $print (call $digest (i32.const 100) (i32.const 0)))
 )
)
