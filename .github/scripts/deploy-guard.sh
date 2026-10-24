#!/usr/bin/env bash
# Decides whether this CI run may deploy to GitHub Pages, and writes
# deploy=true or deploy=false to $GITHUB_OUTPUT.
#
# Runs for commits merged in quick succession can finish out of order. If a
# newer commit (a descendant of this one) is already deployed, deploying
# this one would roll the site back, so skip it. Deploying the same commit
# again is allowed, so re-runs and manual dispatches still work.
#
# Any error falls back to deploying, which is what happens without this
# guard.
set -uo pipefail

decide() {
  echo "deploy=$1" >> "$GITHUB_OUTPUT"
  exit 0
}

fallback() {
  echo "::warning::Deploy guard: $1; deploying anyway"
  decide true
}

deployments=$(gh api "repos/$GITHUB_REPOSITORY/deployments?environment=github-pages&per_page=20" \
  --jq '.[] | "\(.id) \(.sha)"') || fallback "could not list deployments"

while read -r id sha; do
  [ -n "$id" ] || continue
  # Status order is not relied on: take the newest status by id
  state=$(gh api "repos/$GITHUB_REPOSITORY/deployments/$id/statuses?per_page=100" \
    --jq 'max_by(.id) | .state // ""') || fallback "could not read statuses of deployment $id"
  [ "$state" = "success" ] || continue
  [ "$sha" = "$GITHUB_SHA" ] && continue
  git cat-file -e "$sha^{commit}" 2>/dev/null || fallback "deployed commit $sha is not in the history"
  if git merge-base --is-ancestor "$GITHUB_SHA" "$sha"; then
    echo "Newer commit $sha is already deployed; skipping the deploy of $GITHUB_SHA"
    decide false
  fi
done <<< "$deployments"

decide true
