# justfile — the canonical command interface. `just --list` shows every recipe.
# Recipes are thin wrappers; the logic lives in the tools.

# install dependencies from the lockfile
[doc("install dependencies from the lockfile")]
setup:
    bun install --frozen-lockfile

# syntax-check every module with bun's transpiler (the repo has no linter)
[doc("syntax-check every .mjs and .js file")]
lint:
    sh -c 'set -e; for f in server.mjs lib/*.mjs tests/walk.mjs $(find tests -name "*.test.mjs") site/assets/*.js site/config.js; do bun build --no-bundle "$f" >/dev/null; done; echo "lint: syntax ok"'
    just naming

# the naming standard over this repo, as a ratchet (harbor#967): a new finding is red, a fixed one must leave
# gates/naming.baseline. Judged by the vendored package in vendor/naming/; UNCHECKED exits 3, never a pass.
[doc("naming standard ratchet (gates/naming-check.sh)")]
naming:
    sh gates/naming-check.sh

# run the suite; ends with `tracking-testbed: N passed, M failed` (the test contract)
[doc("run the suite; ends with `tracking-testbed: N passed, M failed` (the test contract)")]
test:
    bun test 2>&1 | awk '/^ *[0-9]+ pass/{p=$1} /^ *[0-9]+ fail/{f=$1} {print} END{printf "tracking-testbed: %d passed, %d failed\n", p, f; exit (f>0 || p==0)}'

# fast local gate: lint + tests
[doc("fast local gate: lint + tests")]
fast-ci: lint test

# what CI runs
ci: setup lint test
