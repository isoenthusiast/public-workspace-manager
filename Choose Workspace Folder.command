#!/bin/bash
app_dir="$(cd -- "$(dirname -- "$0")" && pwd)" || exit 1
exec /bin/bash "$app_dir/Start Workspace Manager.command" --choose-folder
