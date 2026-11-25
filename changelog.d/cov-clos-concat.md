## Codegen, memory & runtime (Track B)

- IR list `+` (lane COV-CLOS): a concat whose one side is a narrower list is claimed. The side is built as a list at its own rep and widened by legacy's own tail (`catWidenTail`, shared): a scalar list converted element-wise (`catScalarWidenTail`, split out of legacy's operand writer), or a ref list boxed into the union-box row as a spread group is (`spreadBoxedGroupTail`). `RListCat.ljWiden` names the side for the verifier. Over the 11,500-file list, `list concat widen` falls from 5 to 0, 4 functions are gained and none is lost.
