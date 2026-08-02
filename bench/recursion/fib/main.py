# Reduced N: CPython needs ~123x the time of the others at n=42.
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


print(fib(35))
