# cpu-times.ps1 <exe> <args...> — Windows stand-in for `sh -c '"$@"; times'`, which cannot see
# a native child's CPU there. Runs the command with inherited stdio, prints its user+sys CPU as
# one `0m<s>s` line on stdout, and exits with its code. Arguments must hold no `"`.
$exe, $rest = $args
# Start-Process joins a list unquoted, so each argument is quoted here.
$quoted = @($rest | ForEach-Object { '"' + $_ + '"' })
$p = Start-Process -FilePath $exe -ArgumentList $quoted -NoNewWindow -PassThru
$null = $p.Handle  # keeps ExitCode and the times readable after the process exits
$p.WaitForExit()
"0m{0}s" -f $p.TotalProcessorTime.TotalSeconds.ToString([Globalization.CultureInfo]::InvariantCulture)
exit $p.ExitCode
