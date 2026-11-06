#!/bin/sh
set -eu
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deployment=${WORKBENCH_DEPLOY_DIR:-"${source_dir}-deploy"}
if [ "$(uname -s)" != Darwin ]; then
  echo 'This entry supports macOS. On Windows run Install.cmd.' >&2
  exit 1
fi
node_bin=$(command -v node || true)
if [ -z "$node_bin" ] || ! "$node_bin" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  case "$(uname -m)" in
    arm64) arch=arm64 ;;
    x86_64) arch=x64 ;;
    *) echo 'Unsupported CPU architecture' >&2; exit 1 ;;
  esac
  version=24.13.0
  name="node-v${version}-darwin-${arch}"
  mkdir -p "$deployment/tmp" "$deployment/tools/node"
  curl -fL --retry 3 "https://nodejs.org/dist/v${version}/${name}.tar.gz" -o "$deployment/tmp/${name}.tar.gz"
  curl -fL --retry 3 "https://nodejs.org/dist/v${version}/SHASUMS256.txt" -o "$deployment/tmp/node-SHASUMS256.txt"
  expected=$(awk -v file="${name}.tar.gz" '$2 == file { print $1 }' "$deployment/tmp/node-SHASUMS256.txt")
  actual=$(shasum -a 256 "$deployment/tmp/${name}.tar.gz" | awk '{ print $1 }')
  if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then echo 'Node.js checksum mismatch' >&2; exit 1; fi
  tar -xzf "$deployment/tmp/${name}.tar.gz" -C "$deployment/tools/node"
  node_bin="$deployment/tools/node/$name/bin/node"
fi
export NODE_USE_ENV_PROXY=1
exec "$node_bin" "$source_dir/scripts/install.mjs" "$@"
