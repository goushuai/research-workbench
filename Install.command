#!/bin/sh
set -eu
cd "$(dirname "$0")"
exec sh ./install.sh "$@"
