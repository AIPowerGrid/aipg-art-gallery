#!/usr/bin/env bash
set -euo pipefail

release_root="${RELEASE_ROOT:-/opt/aipg-gallery-releases}"
current_link="${CURRENT_LINK:-/opt/aipg-gallery-current}"
keep_inactive="${KEEP_INACTIVE_RELEASES:-1}"

if [[ ! "$keep_inactive" =~ ^[0-9]+$ ]]; then
  echo "KEEP_INACTIVE_RELEASES must be a non-negative integer" >&2
  exit 2
fi

release_root="$(realpath "$release_root")"
active_release="$(realpath "$current_link")"

if [[ -z "$release_root" || "$release_root" == "/" || ! -d "$release_root" ]]; then
  echo "invalid release root" >&2
  exit 2
fi
if [[ "$active_release" != "$release_root"/gallery-* || ! -d "$active_release" ]]; then
  echo "active release is outside the release root" >&2
  exit 2
fi

shopt -s nullglob
releases=("$release_root"/gallery-*)

inactive_kept=0
while IFS= read -r release; do
  release="$(realpath "$release")"

  [[ "$release" == "$active_release" ]] && continue
  if (( inactive_kept < keep_inactive )); then
    ((inactive_kept += 1))
    continue
  fi
  if [[ "$release" != "$release_root"/gallery-* || ! -d "$release" ]]; then
    echo "refusing unsafe release path: $release" >&2
    exit 2
  fi

  echo "Pruning inactive release: $release"
  find "$release" -xdev -depth -delete
done < <(ls -1dt "${releases[@]}")
