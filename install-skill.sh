#!/bin/sh
# Install the liquid-glass-web skill from this fork
#   curl -fsSL https://raw.githubusercontent.com/tfdmendes/liquidglass/main/install-skill.sh | sh
# Copies skill/liquid-glass-web from the latest GitHub archive into the skills folder of each
# supported agent home found below, replacing an older copy
set -eu
ARCHIVE=https://github.com/tfdmendes/liquidglass/archive/refs/heads/main.tar.gz
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

if ! curl -fsSL "$ARCHIVE" -o "$tmp/archive.tar.gz"; then
  echo "Failed to download liquid-glass-web archive" >&2
  exit 1
fi
if ! tar -xz -f "$tmp/archive.tar.gz" -C "$tmp"; then
  echo "Failed to extract liquid-glass-web archive" >&2
  exit 1
fi
src=$(find "$tmp" -maxdepth 3 -type d -path '*/skill/liquid-glass-web' | head -n 1)
if [ -z "$src" ]; then
  echo "liquid-glass-web not found in the archive" >&2
  exit 1
fi

install_skill() {
  skills=$1/skills
  mkdir -p "$skills"
  replacement=$(mktemp -d "$skills/.liquid-glass-web.XXXXXX")
  if ! cp -R "$src" "$replacement/new"; then
    rm -rf "$replacement"
    echo "Failed to copy liquid-glass-web; previous installation kept" >&2
    return 1
  fi
  destination=$skills/liquid-glass-web
  if [ -e "$destination" ] || [ -L "$destination" ]; then
    if ! mv "$destination" "$replacement/previous"; then
      rm -rf "$replacement"
      echo "Failed to preserve previous installation" >&2
      return 1
    fi
  fi
  if ! mv "$replacement/new" "$destination"; then
    if [ -e "$replacement/previous" ] || [ -L "$replacement/previous" ]; then
      if ! mv "$replacement/previous" "$destination"; then
        echo "Restore failed; previous installation retained at $replacement/previous" >&2
        return 1
      fi
    fi
    rm -rf "$replacement"
    echo "Failed to replace liquid-glass-web; previous installation restored" >&2
    return 1
  fi
  rm -rf "$replacement"
  echo "installed: $destination"
}

installed=0
for agent_home in "$HOME/.claude" "$HOME/.codex"; do
  [ -d "$agent_home" ] || continue
  install_skill "$agent_home"
  installed=1
done

if [ "$installed" -eq 0 ]; then
  install_skill "$HOME/.claude"
  echo "(no agent home found; copy the folder wherever your agent loads skills from)"
fi
