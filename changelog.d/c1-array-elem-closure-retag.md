## Codegen, memory & runtime (Track B)

- IR coverage, array literal closure elements (lane IR-C1): a hole lambda or generic function value delivered into an annotated function list is retagged into the element's closure rep, as a record field already did. 15 functions in the `array element coercion` closure → closure share are now claimed byte-identical, and 6 move to existing classes.
