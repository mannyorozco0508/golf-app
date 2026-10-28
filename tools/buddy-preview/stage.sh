#!/bin/zsh
# 096: stage the gps-buddy Pages PREVIEW (never production). Usage: stage.sh <staging-dir>
# Writes <staging>/public (the built web files, gate on) and <staging>/functions (the repo's
# Pages Functions + the end-date _middleware.js). Deploy from <staging> with
#   npx -y wrangler@3 pages deploy public --project-name golf-app --branch gps-buddy --commit-dirty=true
set -e
REPO=${0:A:h:h:h}
ST=${1:?staging dir}
rm -rf "$ST/public" "$ST/functions"; mkdir -p "$ST"
HARDPAN_BUDDY_PREVIEW=1 GPS_APP_DEST="$ST/public" node "$REPO/tools/build-gps-app.js"
rm -f "$ST/public/gps-golfapi.js"
cp -R "$REPO/functions" "$ST/functions"
cp "$REPO/tools/buddy-preview/_middleware.js" "$ST/functions/_middleware.js"
echo "staged: $ST"
