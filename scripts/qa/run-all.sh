#!/usr/bin/env bash
# Regression suite — re-run every QA driver script. Use each round to confirm fixes hold
# and no new flicker/double-jump/console errors crept in. Requires dev server on :3200.
set -u
cd "$(dirname "$0")/../.."
SCRIPTS=(
  "test-seed-cache.js"     # seed bug: m6 recommend cache invalidation
  "test-nav-clicks.js"     # 8 nav links, guest + logged-in
  "test-m6-cta.js"         # m6 → m3 / m6 → m5 cross-module CTAs
  "test-inpage-m6.js"      # m6 tabs + JD modal + 不二 widget
  "test-inpage-generic.js" # safe button sweep tracker/diary/m4/m2/m1
  "test-corepath-guest.js"  # m1 quiz progression + m3 guest form
  "test-concurrency.js"   # rapid-click / state-corruption probe
  "test-deeplinks.js"      # cold deep-link visits
)
for s in "${SCRIPTS[@]}"; do
  echo ""
  echo "==================== $s ===================="
  node "scripts/qa/$s" 2>&1 | grep -vE 'webpack-internal|auth-js|GoTrueClient|^\s+at ' || true
done
