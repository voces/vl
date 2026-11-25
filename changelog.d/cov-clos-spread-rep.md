## Codegen, memory & runtime (Track B)

- IR soundness (lane COV-CLOS): a boxing spread literal (`spreadBoxedLit`, from #10090) now carries the rep of the list it builds, a list of its union row's boxes. Before, it carried the literal's own checker rep, such as `i32[]`, which misdescribed its elements. COV-START found it: every consumer missed on a list coercion, which kept it from being read as `i32`. The verifier now requires a boxing spread to be a list of boxes. Over the 466 spread programs, 9 more functions and 4 more start bodies are claimed, and none is lost.
