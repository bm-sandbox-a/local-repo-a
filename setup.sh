#!/bin/sh
# Everything a fresh checkout needs before `npm test` will work.
#
# Run by a person, and run by a machine that was just provisioned. Those are
# the same steps, so there is one script rather than a script and a paragraph
# in the README that drifts from it.
#
# `set -e` so that a failure stops here rather than three steps later as
# something unrelated-looking.
set -eu

cd "$(dirname "$0")"

echo "notes-api: checking node"
if ! command -v node >/dev/null 2>&1; then
  echo "node is not installed. install node 20 or newer and run this again." >&2
  exit 1
fi

# The suite uses the built-in test runner and the global fetch, both of which
# are only stable from 20. Failing here with the version is kinder than failing
# later with "test is not a function".
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 20 ]; then
  echo "node $(node -v) is too old. this needs node 20 or newer." >&2
  exit 1
fi
echo "notes-api: node $(node -v)"

# There are no dependencies, and that is on purpose -- but the install is still
# run, because a lockfile that has stopped matching package.json should be
# found here rather than by the next person.
echo "notes-api: installing"
npm install --no-audit --no-fund

echo "notes-api: running the suite"
npm test

echo
echo "notes-api: ready. start it with:  npm start"
