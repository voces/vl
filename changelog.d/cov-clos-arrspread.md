## Codegen, memory & runtime (Track B)

- IR spread literal (lane COV-CLOS): a group at another element kind than the literal's (a scalar list widened, or a literal union's atoms into a `string` list) is claimed. The group is built as a list at its own element rep, and the plan's own tail converts it (`spreadGroupStash`, its predicate now shared as `spreadGroupConverts`); `RSpread.spConv` names the converted groups for the verifier. Over the 11,500-file list, `array spread conversion` falls from 8 to 3 and 4 functions are gained with none lost; 1 moves on to `list concat widen`.
