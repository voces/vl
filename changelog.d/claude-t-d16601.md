## Codegen, memory & runtime (Track B)

- **D16601 closed:** a list of empty lists handed to an un-annotated callback (`h(3, [[]])`, `[[], []]`, `[[[]]]`) is now built, in each instance, at that instance's callback parameter type, as an empty list already is (D16510). Before, the second instance built the first one's storage and the module was invalid.
