## Type system (Track A)

- **D16993 closed:** a read-only empty list (`const xs = []`) read into a typed destination, through an element read, a loop over it, or an alias, is that type, where it took the `i32` default at its declaration and the read was refused. Two reads that disagree are refused at check. The map face stays open as D16994.
