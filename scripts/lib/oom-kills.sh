# The number of processes the kernel's OOM killer has killed so far: /proc/vmstat's system-wide
# `oom_kill` plus this cgroup's `memory.events` `oom_kill`, whichever are readable; empty when
# neither is. Sourced by scripts/gate.sh, which compares a reading at the start of a run with
# one at its end. $OOM_VMSTAT and $OOM_CGROUP_EVENTS name the files (tests/ci_signal_guard_test.ts).
oom_kills() {
  local n="" v
  v=$(awk '$1 == "oom_kill" { print $2 }' "${OOM_VMSTAT:-/proc/vmstat}" 2>/dev/null)
  [ -n "$v" ] && n=$v
  v=$(awk '$1 == "oom_kill" { print $2 }' "${OOM_CGROUP_EVENTS:-/sys/fs/cgroup/memory.events}" 2>/dev/null)
  [ -n "$v" ] && n=$(( ${n:-0} + v ))
  echo "$n"
}
