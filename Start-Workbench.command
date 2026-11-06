#!/bin/sh
set -eu
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deployment=${WORKBENCH_DEPLOY_DIR:-"${source_dir}-deploy"}
exec "$deployment/Start-Workbench.command"
