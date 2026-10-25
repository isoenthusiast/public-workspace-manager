#!/bin/bash
# Finder opens executable .command files in Terminal.
app_dir="$(cd -- "$(dirname -- "$0")" && pwd)" || exit 1
pwm_python=""
for candidate in python3 /opt/homebrew/bin/python3 /usr/local/bin/python3; do
    if "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 10))' >/dev/null 2>&1; then
        pwm_python="$candidate"
        break
    fi
done
if [ -z "$pwm_python" ]; then
    echo 'Python 3.10 or newer is required. Install it, then open this launcher again.'
    read -r -p 'Press Return to close.'
    exit 1
fi
"$pwm_python" "$app_dir/launch.py" "$@"
result=$?
if [ "$result" -ne 0 ]; then
    read -r -p 'The app stopped with an error. Press Return to close.'
fi
exit "$result"
