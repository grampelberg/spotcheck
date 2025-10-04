[no-cd]
run *ARGS:
    # Force `./src` because bun test doesn't respect package.json
    bun test {{ ARGS }} src

[no-cd]
dev $LOG_LEVEL="*=debug":
    just test::run "--watch"

[no-cd]
concurrent:
    just test::run "--concurrent"

default: run
