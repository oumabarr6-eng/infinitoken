#!/usr/bin/env bash
# Install Infinitoken into a project: ./install.sh [target-dir]
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/template" && pwd)"
DEST="$(cd "${1:-.}" && pwd)"
MARK="<!-- infinitoken -->"

# Copy a file unless it already exists.
copy_new() {
  local rel="$1"
  if [ -e "$DEST/$rel" ]; then
    echo "  skip    $rel (exists)"
  else
    mkdir -p "$(dirname "$DEST/$rel")"
    cp "$SRC/$rel" "$DEST/$rel"
    echo "  create  $rel"
  fi
}

# Append our rules to an existing file once; create it otherwise.
merge_rules() {
  local rel="$1"
  if [ ! -e "$DEST/$rel" ]; then
    copy_new "$rel"
  elif grep -qF "$MARK" "$DEST/$rel"; then
    echo "  skip    $rel (already has Infinitoken rules)"
  else
    echo >> "$DEST/$rel"
    cat "$SRC/$rel" >> "$DEST/$rel"
    echo "  append  $rel"
  fi
}

# Add our hooks and permission rules to .claude/settings.json, keeping the user's settings.
merge_settings() {
  local rel=".claude/settings.json"
  if [ ! -e "$DEST/$rel" ]; then
    copy_new "$rel"
  elif ! command -v node >/dev/null; then
    echo "  skip    $rel (exists; Node.js needed to merge, see template/$rel)"
  else
    node - "$SRC/$rel" "$DEST/$rel" <<'JS'
const fs = require("fs");
const [src, dest] = process.argv.slice(2);
const ours = JSON.parse(fs.readFileSync(src, "utf8"));
const theirs = JSON.parse(fs.readFileSync(dest, "utf8"));
theirs.hooks ??= {};
let added = 0;
for (const [event, groups] of Object.entries(ours.hooks)) {
  const existing = JSON.stringify(theirs.hooks[event] ?? []);
  for (const g of groups) {
    if (g.hooks.every((h) => existing.includes(JSON.stringify(h.command)))) continue;
    (theirs.hooks[event] ??= []).push(g);
    added++;
  }
}
for (const rule of ours.permissions?.allow ?? []) {
  const allow = ((theirs.permissions ??= {}).allow ??= []);
  if (!allow.includes(rule)) { allow.push(rule); added++; }
}
if (added) fs.writeFileSync(dest, JSON.stringify(theirs, null, 2) + "\n");
console.log(`  ${added ? "merge " : "skip  "}  .claude/settings.json${added ? "" : " (already up to date)"}`);
JS
  fi
}

echo "Installing Infinitoken into $DEST"
merge_rules AGENTS.md
merge_rules CLAUDE.md
copy_new .infinitoken/memory.md
copy_new .infinitoken/session.md
copy_new .claude/commands/save.md
copy_new .claude/commands/resume.md
copy_new .infinitoken/codemap.mjs
copy_new .infinitoken/squeeze.mjs
copy_new .infinitoken/.gitignore
merge_settings

if command -v node >/dev/null; then
  node "$DEST/.infinitoken/codemap.mjs" "$DEST" | sed 's/^/  /'
else
  echo "  warning: Node.js not found; install it to generate the codemap."
fi
echo "Done. Fill in .infinitoken/memory.md with your stack and conventions."
