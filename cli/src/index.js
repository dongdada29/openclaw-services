#!/bin/bash
export OPENCLAW_SERVICES_HOME="$HOME/.openclaw/services"
node "$OPENCLAW_SERVICES_HOME/cli/src/index.js" "$@"
