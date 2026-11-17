#!/bin/zsh
# Install the hourly health check (tools/health-check.mjs) as a LaunchAgent on this Mac.
#   tools/health/install.sh          copies the script to ~/.hardpan/health/ and writes the plist; does NOT start it
#   tools/health/install.sh --load   also loads it (launchctl), so it runs every hour from now (and once right away)
#   tools/health/install.sh --unload stops and removes it
# Needs, beside the script in ~/.hardpan/health/: probe.json { apiKey, refreshToken } (0600), score-body.json, course-body.json.
# The agent runs `node ~/.hardpan/health/health-check.mjs` and writes its stdout/stderr to ~/.hardpan/health/last.log.
set -e
HERE=${0:A:h}; REPO=${HERE:h:h}
HOME_DIR=$HOME/.hardpan/health
LABEL=com.hardpan.health
PLIST=$HOME/Library/LaunchAgents/$LABEL.plist
NODE=$(command -v node)
if [[ "$1" == "--unload" ]]; then launchctl bootout gui/$(id -u) "$PLIST" 2>/dev/null || true; rm -f "$PLIST"; echo "unloaded + removed $PLIST"; exit 0; fi
mkdir -p "$HOME_DIR" "$HOME/Library/LaunchAgents"
cp "$REPO/tools/health-check.mjs" "$HOME_DIR/health-check.mjs"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$NODE</string><string>$HOME_DIR/health-check.mjs</string></array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME_DIR/last.log</string>
  <key>StandardErrorPath</key><string>$HOME_DIR/last.log</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
</dict></plist>
EOF
echo "installed $HOME_DIR/health-check.mjs and $PLIST (node: $NODE)"
for f in probe.json score-body.json course-body.json; do [[ -f "$HOME_DIR/$f" ]] && echo "  have $f" || echo "  MISSING $f (the scan probe will report 'not set up')"; done
if [[ "$1" == "--load" ]]; then launchctl bootout gui/$(id -u) "$PLIST" 2>/dev/null || true; launchctl bootstrap gui/$(id -u) "$PLIST"; echo "loaded: runs now and every hour; log $HOME_DIR/last.log"; else echo "not loaded (add --load)"; fi
