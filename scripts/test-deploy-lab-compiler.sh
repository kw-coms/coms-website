#!/usr/bin/env bash
# Runs the compiler steps of the deploy (scripts/deploy-lab-compiler.sh) across several releases against
# a throwaway compose project with a stand-in image, so the snapshot / restore / prune / failure paths
# can be checked without a server. Needs Docker and the nginx:1.28-alpine image (any small image works).
# It uses the container name coms-lab-compiler (as the real deploy does), so it refuses to run if one exists.
#
# The order of the steps is not restated here: it is read from .github/workflows/deploy.yml, checked
# against what the deploy must do (snapshot before build, rollback in the failure branch, start only
# after the health check, finalize last), and then executed as found.
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

deploy_yml="$here/../.github/workflows/deploy.yml"
read -r -a order <<< "$(grep -E '^[[:space:]]+lab_(diagnostics|snapshot_previous|build|rollback|start|finalize_tags)$' "$deploy_yml" | tr -d ' ' | paste -sd' ' -)"
check "deploy.yml calls the compiler steps in a safe order" "${order[*]}" "lab_diagnostics lab_snapshot_previous lab_build lab_rollback lab_start lab_finalize_tags"
line() { grep -n -E "$1" "$deploy_yml" | head -n 1 | cut -d: -f1; }
check "rollback sits in the failure branch (after the health check, before the success path)" \
  "$([ "$(line '^\s+if ! site_is_healthy')" -lt "$(line '^\s+lab_rollback$')" ] && [ "$(line '^\s+lab_rollback$')" -lt "$(line '^\s+lab_start$')" ] && echo yes)" yes
check "the compiler is started only after the site's health check" \
  "$([ "$(line '^\s+if ! site_is_healthy')" -lt "$(line '^\s+lab_start$')" ] && echo yes)" yes
rollback_at=0; for i in "${!order[@]}"; do [ "${order[$i]}" = lab_rollback ] && rollback_at=$i; done
pre=("${order[@]:0:rollback_at}")              # before the health check
success=("${order[@]:rollback_at+1}")           # health check passed
failure=("${order[rollback_at]}")               # health check failed -> the site rolls back

# One release as the workflow runs it. site_ok=0 simulates a failed site health check (rollback).
release() { # tag [site_ok=1]
  NEW_TAG="$1"; export COMS_IMAGE_TAG="$1"
  for step in "${pre[@]}"; do "$step" > /dev/null; done
  if [ "${2:-1}" = 1 ]; then for step in "${success[@]}"; do "$step"; done; else for step in "${failure[@]}"; do "$step"; done; fi
}
state() { # name expected_tags expected_latest_ref expected_previous_ref(or none) expected_running_ref
  check "$1: tags" "$(tags)" "$2"
  check "$1: latest" "$(image_id latest)" "$3"
  check "$1: previous" "$(image_id previous)" "$4"
  check "$1: running" "$(running_id)" "$5"
}

echo "== release 1 (first deploy: no compiler exists yet)"
release r1
r1_id="$(image_id r1)"
check "no previous snapshot on the first deploy" "$LAB_PREVIOUS" 0
state "r1" "latest,r1" "$r1_id" none "$r1_id"

echo "== release 2: site health check fails -> site rolls back, compiler untouched"
release r2 0
state "r2 rolled back" "latest,previous,r1,r2" "$r1_id" "$r1_id" "$r1_id"

echo "== release 2 again, healthy"
release r2
r2_id="$(image_id r2)"
state "r2" "latest,previous,r2" "$r2_id" "$r1_id" "$r2_id"

echo "== release 3: the new compiler fails to start -> previous comes back and stays \`latest\`"
eval "$(declare -f lab_compose | sed 's/^lab_compose/orig_lab_compose/')"
lab_compose() { if [ "${COMS_IMAGE_TAG:-}" = r3 ] && [ "$1" = up ]; then echo "simulated start error" >&2; return 1; fi; orig_lab_compose "$@"; }
release r3
check "r3 was not activated" "$LAB_ACTIVATED" 0
state "r3 failed to start" "latest,previous,r2,r3" "$r2_id" "$r2_id" "$r2_id"
unset -f lab_compose
eval "$(declare -f orig_lab_compose | sed 's/^orig_lab_compose/lab_compose/')"

echo "== release 4: image build fails -> warning only, nothing changes"
FAIL=1 release r4
check "nothing built" "$LAB_BUILT" 0
state "r4 build failed" "latest,previous,r2,r3" "$r2_id" "$r2_id" "$r2_id"

echo "== release 5: low memory -> compiler skipped entirely"
LAB_AVAILABLE_MB=500 release r5
check "no r5 image" "$(image_id r5)" none
state "r5 low memory" "latest,previous,r2,r3" "$r2_id" "$r2_id" "$r2_id"

echo "== release 6: recovers; old and failed images are pruned"
release r6
r6_id="$(image_id r6)"
state "r6" "latest,previous,r6" "$r6_id" "$r2_id" "$r6_id"

if [ "$fails" -ne 0 ]; then echo "$fails check(s) failed" >&2; exit 1; fi
echo "all deploy-lab-compiler checks passed"
