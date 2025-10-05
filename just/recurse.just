recurse +args='':
    #!/usr/bin/env bash
    set -eu -o pipefail

    # Walk subdirs for Justfiles
    fd -g Justfile | while read -r jf; do
        dir=$(dirname "$jf")
        echo "Running {{ args }} in ${dir}"

        cd "${dir}"

        just {{ args }}
    done
