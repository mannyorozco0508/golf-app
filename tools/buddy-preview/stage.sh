#!/bin/zsh
# 096: stage the gps-buddy Pages PREVIEW (never production). Usage: stage.sh <staging-dir>
# Writes <staging>/public (the built web files, gate on) and <staging>/functions (the repo's
# Pages Functions + the end-date _middleware.js). Deploy from <staging> with
#   npx -y wrangler@3 pages deploy public --project-name golf-app --branch gps-buddy --commit-dirty=true
set -e
REPO=${0:A:h:h:h}
ST=${1:?staging dir}
rm -rf "$ST/public" "$ST/functions"; mkdir -p "$ST"
HARDPAN_BUDDY_PREVIEW=1 HARDPAN_BUDDY_PREVIEW_END=${HARDPAN_BUDDY_PREVIEW_END:-} GPS_APP_DEST="$ST/public" node "$REPO/tools/build-gps-app.js"
rm -f "$ST/public/gps-golfapi.js"
cp -R "$REPO/functions" "$ST/functions"
# 098: per-build end instant (HARDPAN_BUDDY_PREVIEW_END, ms UTC; unset = 096's Nov 4) in the server gate too.
BP_END=${HARDPAN_BUDDY_PREVIEW_END:-1793862000000}
sed -E "s|^export const END = [0-9]+;.*$|export const END = ${BP_END};   // ended from this instant (ms UTC, set per build, 098)|" "$REPO/tools/buddy-preview/_middleware.js" > "$ST/functions/_middleware.js"
grep -q "^export const END = ${BP_END};" "$ST/functions/_middleware.js" || { echo "middleware END not set"; exit 1; }
echo "staged: $ST"
