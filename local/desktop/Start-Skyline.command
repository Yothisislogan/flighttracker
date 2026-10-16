#!/bin/sh
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  python3 skyline.py
else
  echo 'Python 3 is required. Download it from https://www.python.org/downloads/'
fi
printf '\nPress Enter to close...'
read -r skyline_answer
