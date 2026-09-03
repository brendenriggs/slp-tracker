#!/usr/bin/env bash
# Runs the test suite in headless Chrome against the real index.html.
# Usage: bash tests/run-tests.sh
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$HERE/.chrome-profile"
LOG="$HERE/chrome.log"
CHROME="${CHROME:-google-chrome}"

rm -rf "$PROFILE" "$LOG"
mkdir -p "$PROFILE"

"$CHROME" \
  --headless=new \
  --no-sandbox \
  --disable-gpu \
  --allow-file-access-from-files \
  --user-data-dir="$PROFILE" \
  --enable-logging --log-file="$LOG" --v=0 \
  "file://$HERE/index.html" >/dev/null 2>&1 &
CHROME_PID=$!

# window.close() in the harness is blocked by the browser (the page is the
# initial navigation target, not one opened by script), so the process never
# exits on its own. Poll the log for completion and kill it ourselves.
for i in $(seq 1 120); do
  if [ -f "$LOG" ] && grep -q 'TAP: # done' "$LOG"; then
    break
  fi
  if ! kill -0 "$CHROME_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done
kill -KILL "$CHROME_PID" 2>/dev/null
wait "$CHROME_PID" 2>/dev/null

if [ ! -f "$LOG" ]; then
  echo "FATAL: chrome produced no log. Is \$CHROME ($CHROME) installed?"
  exit 2
fi

# Chrome logs console lines as: [...] "TAP: ...", source: file://...
grep -o 'TAP: [^"]*' "$LOG" | sed 's/^TAP: //'

if ! grep -q 'TAP: # done' "$LOG"; then
  echo "FATAL: suite did not finish (crash, hang, or syntax error). Full log: $LOG"
  exit 2
fi

if grep -q 'TAP: not ok' "$LOG"; then
  exit 1
fi
exit 0
