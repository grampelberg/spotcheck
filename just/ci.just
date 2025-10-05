[no-cd]
default: format lint dep
    just test::run

[no-cd]
dep:
    bun dep:check

[no-cd]
format:
    bun format:check

[no-cd]
lint:
    bun lint:check
