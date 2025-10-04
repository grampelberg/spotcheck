mod test './just/test.just'

dep:
    bun dep:check

format:
    bun format:check

lint:
    bun lint:check

ci: format lint dep
    just test
