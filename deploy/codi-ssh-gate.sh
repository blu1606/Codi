#!/usr/bin/env bash
# Forced command for the CI key; install root-owned under /usr/local/libexec.
set -euo pipefail
command_text=${SSH_ORIGINAL_COMMAND:-}
if [[ "$command_text" =~ ^/opt/codi/deploy\.sh\ ([0-9a-f]{40})$ ]]; then
  exec sudo -n /usr/local/sbin/codi-deploy "${BASH_REMATCH[1]}"
fi
echo 'This key only permits Codi deployments.' >&2
exit 1
