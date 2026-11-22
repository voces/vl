VL_IR_SHADOW=5 /home/user/vl/scripts/vl-host/target/release/vl check --codegen --compiler "$PROBE" "$@" 2>&1 >/dev/null | grep -a '^\[ir\] .*	fmiss ' 
true
