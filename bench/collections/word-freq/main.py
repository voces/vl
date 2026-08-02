# Word frequency — the classic mixed map + string benchmark. See main.vl.
#
# Idiomatic Python: a dict counted with `d[w] = d.get(w, 0) + 1`. The tokenizer
# is the same explicit character scan the other three use — Python's `.split()`
# would be far faster (it is C), but it would not be the same algorithm, and VL
# has no `split` at all. R is REDUCED (see meta.json nPython / expectPython).


def main():
    v = 2_000
    d = 4_000
    k = 20
    r = 12

    vocab = []
    for i in range(v):
        vocab.append("w" + str(i))

    # MINSTD LCG; every product stays under 2^53 so JS doubles are exact too.
    seed = 42
    docs = []
    for _ in range(d):
        doc = ""
        for j in range(k):
            seed = (seed * 48271) % 2147483647
            t = seed % v
            idx = (t * t) // v
            if j > 0:
                doc = doc + " "
            doc = doc + vocab[idx]
        docs.append(doc)

    freq = {}
    tokens = 0
    for _ in range(r):
        for i in range(d):
            doc = docs[i]
            start = 0
            j = 0
            while j < len(doc):
                if doc[j] == " ":
                    if j > start:
                        w = doc[start:j]
                        freq[w] = freq.get(w, 0) + 1
                        tokens += 1
                    start = j + 1
                j += 1
            if j > start:
                w = doc[start:j]
                freq[w] = freq.get(w, 0) + 1
                tokens += 1

    max_count = 0
    checksum = 0
    for i in range(v):
        c = freq.get(vocab[i], 0)
        if c > max_count:
            max_count = c
        checksum += c * (i + 1)

    print(len(freq))
    print(tokens)
    print(max_count)
    print(checksum)


main()
