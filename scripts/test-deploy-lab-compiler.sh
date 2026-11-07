#!/usr/bin/env bash
# Runs the compiler steps of the deploy (scripts/deploy-lab-compiler.sh) across several releases against
# a throwaway compose project with a stand-in image, so the snapshot / restore / prune / failure paths
# can be checked without a server. Needs Docker and the nginx:1.28-alpine image (any small image works).
# It uses the container name coms-lab-compiler (as the real deploy does), so it refuses to run if one exists.
#
# Usage: scripts/test-deploy-lab-compiler.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
if docker inspect coms-lab-compiler >/dev/null 2>&1; then
  echo "A container named coms-lab-compiler exists; refusing to touch it." >&2
  exit 2
fi

work="$(mktemp -d)"
cleanup() {
  docker rm -f coms-lab-compiler >/dev/null 2>&1 || true
  docker image ls coms-lab-compiler --format '{{.Repository}}:{{.Tag}}' | xargs docker rmi -f >/dev/null 2>&1 || true
  rm -r "$work"
}
trap cleanup EXIT

mkdir -p "$work/ctx"
cat > "$work/ctx/Dockerfile" <<'DOCKERFILE'
FROM nginx:1.28-alpine
ARG REL=0
ARG FAIL=0
RUN echo "$REL" > /rel && [ "$FAIL" != 1 ]
CMD ["sleep", "3600"]
DOCKERFILE
cat > "$work/compose.yml" <<'YAML'
services:
  coms-lab-compiler:
    image: coms-lab-compiler:${COMS_IMAGE_TAG:-latest}
    container_name: coms-lab-compiler
    build:
      context: ./ctx
      args:
        REL: ${COMS_IMAGE_TAG:-latest}
        FAIL: ${FAIL:-0}
YAML

export COMPOSE="docker compose"
export LAB_COMPOSE_ARGS="-p labdeploytest -f $work/compose.yml"
export LAB_AVAILABLE_MB=4000
# shellcheck source=deploy-lab-compiler.sh
. "$here/deploy-lab-compiler.sh"

fails=0
check() { if [ "$2" = "$3" ]; then echo "ok   - $1"; else echo "FAIL - $1 (expected '$3', got '$2')"; fails=$((fails + 1)); fi; }
image_id() { local id; id="$(docker image inspect -f '{{.Id}}' "coms-lab-compiler:$1" 2>/dev/null || true)"; echo "${id:-none}"; }
running_id() { docker inspect -f '{{.Image}}' coms-lab-compiler 2>/dev/null || echo none; }
tags() { docker image ls coms-lab-compiler --format '{{.Tag}}' | sort | paste -sd, -; }

# One release as the workflow runs it: snapshot -> build -> (site up + health) -> start -> finalize.
release() { # tag [site_ok=1]
  NEW_TAG="$1"; export COMS_IMAGE_TAG="$1"
  lab_diagnostics > /dev/null
  lab_snapshot_previous
  lab_build
  if [ "${2:-1}" = 1 ]; then lab_start; lab_finalize_tags; else lab_rollback; fi
}

echo "== release 1 (first deploy: no compiler exists yet)"
release r1
check "no previous snapshot on the first deploy" "$LAB_PREVIOUS" 0
check "r1 is running" "$(running_id)" "$(image_id r1)"
check "tags after r1" "$(tags)" "latest,r1"
r1_id="$(image_id r1)"

echo "== release 2 rolls back (site unhealthy): the compiler stays on r1"
release r2 0
check "r1 still running after the site rollback" "$(running_id)" "$(image_id r1)"
check "previous snapshot is r1" "$(image_id previous)" "$(image_id r1)"
check "latest points back at r1" "$(image_id latest)" "$(image_id r1)"

echo "== release 2 again, healthy"
release r2
check "r2 is running" "$(running_id)" "$(image_id r2)"
check "previous is r1's image" "$(image_id previous)" "$r1_id"
check "latest is r2" "$(image_id latest)" "$(image_id r2)"
check "tags after r2 (r1 pruned, previous kept)" "$(tags)" "latest,previous,r2"
r2_id="$(image_id r2)"

echo "== release 3: the new compiler fails to start -> previous one comes back, deploy goes on"
eval "$(declare -f lab_compose | sed 's/^lab_compose/orig_lab_compose/')"
lab_compose() { if [ "${COMS_IMAGE_TAG:-}" = r3 ] && [ "$1" = up ]; then echo "simulated start error" >&2; return 1; fi; orig_lab_compose "$@"; }
release r3
check "the previous (r2) compiler is running again" "$(running_id)" "$r2_id"
unset -f lab_compose
eval "$(declare -f orig_lab_compose | sed 's/^orig_lab_compose/lab_compose/')"

echo "== release 4: image build fails -> warning only, running compiler untouched"
before="$(running_id)"
FAIL=1 release r4
check "build failure leaves the running compiler alone" "$(running_id)" "$before"
check "nothing built" "$LAB_BUILT" 0

echo "== release 5: low memory -> compiler skipped entirely"
LAB_AVAILABLE_MB=500 release r5
check "low memory leaves the running compiler alone" "$(running_id)" "$before"
check "no r5 image" "$(image_id r5)" none

if [ "$fails" -ne 0 ]; then echo "$fails check(s) failed" >&2; exit 1; fi
echo "all deploy-lab-compiler checks passed"
