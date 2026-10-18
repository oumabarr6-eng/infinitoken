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

echo "Installing Infinitoken into $DEST"
merge_rules AGENTS.md
merge_rules CLAUDE.md
copy_new .infinitoken/memory.md
copy_new .infinitoken/session.md
copy_new .claude/commands/save.md
copy_new .claude/commands/resume.md
echo "Done. Fill in .infinitoken/memory.md with your stack and conventions."
