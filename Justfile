mod test './just/test.just'
mod ci './just/ci.just'

import './just/recurse.just'

install:
    mise install
    bun install --frozen-lockfile
