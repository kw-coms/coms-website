#!/usr/bin/env bash
# Runs the sidecar steps of the deploy (scripts/deploy-sidecars.sh) for BOTH optional services (the Circuit
# Lab compiler and the study code runner) across several releases against a throwaway compose project with
# stand-in images, so the snapshot / restore / prune / failure paths can be checked without a server.
# Needs Docker and the nginx:1.28-alpine image (any small image works). It uses the container names the
# real deploy uses (coms-lab-compiler, coms-study-runner), so it refuses to run if one exists.
#
# The order of the steps is not restated here: it is read from .github/workflows/deploy.yml, checked
# against what the deploy must do (snapshot before build, rollback in the failure branch, start only
# after the health check, finalize last), and then executed as found.
#
# Usage: scripts/test-deploy-sidecars.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
lab=coms-lab-compiler
runner=coms-study-runner
for name in $lab $runner; do
  if docker inspect "$name" >/dev/null 2>&1; then
    echo "A container named $name exists; refusing to touch it." >&2
    exit 2
  fi
done

work="$(mktemp -d)"
cleanup() {
  docker rm -f $lab $runner >/dev/null 2>&1 || true
  for name in $lab $runner; do
    docker image ls "$name" --format '{{.Repository}}:{{.Tag}}' | xargs docker rmi -f >/dev/null 2>&1 || true
  done
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
        FAIL: ${FAIL_LAB:-0}
  coms-study-runner:
    image: coms-study-runner:${COMS_IMAGE_TAG:-latest}
    container_name: coms-study-runner
    build:
      context: ./ctx
      args:
        REL: ${COMS_IMAGE_TAG:-latest}
        FAIL: ${FAIL_RUNNER:-0}
YAML

export COMPOSE="docker compose"
export SIDECAR_COMPOSE_ARGS="-p sidecardeploytest -f $work/compose.yml"
export SIDECAR_AVAILABLE_MB=4000
export SIDECARS="$lab $runner"
# shellcheck source=deploy-sidecars.sh
. "$here/deploy-sidecars.sh"

fails=0
check() { if [ "$2" = "$3" ]; then echo "ok   - $1"; else echo "FAIL - $1 (expected '$3', got '$2')"; fails=$((fails + 1)); fi; }
image_id() { local id; id="$(docker image inspect -f '{{.Id}}' "$1:$2" 2>/dev/null || true)"; echo "${id:-none}"; }
running_id() { docker inspect -f '{{.Image}}' "$1" 2>/dev/null || echo none; }
tags() { docker image ls "$1" --format '{{.Tag}}' | sort | paste -sd, -; }

deploy_yml="$here/../.github/workflows/deploy.yml"
read -r -a order <<< "$(grep -E '^[[:space:]]+sidecars_(diagnostics|snapshot|build|rollback|start|finalize_tags)$' "$deploy_yml" | tr -d ' ' | paste -sd' ' -)"
check "deploy.yml calls the sidecar steps in a safe order" "${order[*]}" "sidecars_diagnostics sidecars_snapshot sidecars_build sidecars_rollback sidecars_start sidecars_finalize_tags"
line() { grep -n -E "$1" "$deploy_yml" | head -n 1 | cut -d: -f1; }
check "rollback sits in the failure branch (after the health check, before the success path)" \
  "$([ "$(line '^\s+if ! site_is_healthy')" -lt "$(line '^\s+sidecars_rollback$')" ] && [ "$(line '^\s+sidecars_rollback$')" -lt "$(line '^\s+sidecars_start$')" ] && echo yes)" yes
check "the sidecars are started only after the site's health check" \
  "$([ "$(line '^\s+if ! site_is_healthy')" -lt "$(line '^\s+sidecars_start$')" ] && echo yes)" yes
check "the site's services are started by name, never the sidecars" \
  "$(grep -E 'up -d --remove-orphans' "$deploy_yml" | grep -c -E 'coms-lab-compiler|coms-study-runner')" 0
rollback_at=0; for i in "${!order[@]}"; do [ "${order[$i]}" = sidecars_rollback ] && rollback_at=$i; done
pre=("${order[@]:0:rollback_at}")              # before the health check
success=("${order[@]:rollback_at+1}")           # health check passed
failure=("${order[rollback_at]}")               # health check failed -> the site rolls back

# One release as the workflow runs it. site_ok=0 simulates a failed site health check (rollback).
release() { # tag [site_ok=1]
  NEW_TAG="$1"; export COMS_IMAGE_TAG="$1"
  for step in "${pre[@]}"; do "$step" > /dev/null; done
  if [ "${2:-1}" = 1 ]; then for step in "${success[@]}"; do "$step"; done; else for step in "${failure[@]}"; do "$step"; done; fi
}
state() { # service name expected_tags expected_latest_id expected_previous_id expected_running_id
  check "$2 $1: tags" "$(tags "$1")" "$3"
  check "$2 $1: latest" "$(image_id "$1" latest)" "$4"
  check "$2 $1: previous" "$(image_id "$1" previous)" "$5"
  check "$2 $1: running" "$(running_id "$1")" "$6"
}

echo "== release 1 (first deploy: neither sidecar exists yet)"
release r1
l1="$(image_id $lab r1)"; n1="$(image_id $runner r1)"
check "no previous snapshot on the first deploy" "$(sc_get $lab PREVIOUS)$(sc_get $runner PREVIOUS)" 00
state $lab r1 "latest,r1" "$l1" none "$l1"
state $runner r1 "latest,r1" "$n1" none "$n1"

echo "== release 2: site health check fails -> site rolls back, both sidecars untouched"
release r2 0
state $lab "r2 rolled back" "latest,previous,r1,r2" "$l1" "$l1" "$l1"
state $runner "r2 rolled back" "latest,previous,r1,r2" "$n1" "$n1" "$n1"

echo "== release 2 again, healthy"
release r2
l2="$(image_id $lab r2)"; n2="$(image_id $runner r2)"
state $lab r2 "latest,previous,r2" "$l2" "$l1" "$l2"
state $runner r2 "latest,previous,r2" "$n2" "$n1" "$n2"

echo "== release 3: the new RUNNER fails to start -> its previous comes back; the compiler still moves on"
eval "$(declare -f sc_compose | sed 's/^sc_compose/orig_sc_compose/')"
sc_compose() { if [ "${COMS_IMAGE_TAG:-}" = r3 ] && [ "$1" = up ] && [ "$3" = --no-build ] && [ "$4" = $runner ]; then echo "simulated start error" >&2; return 1; fi; orig_sc_compose "$@"; }
release r3
l3="$(image_id $lab r3)"
check "the runner was not activated" "$(sc_get $runner ACTIVATED)" 0
check "the compiler was" "$(sc_get $lab ACTIVATED)" 1
state $lab "r3" "latest,previous,r3" "$l3" "$l2" "$l3"
state $runner "r3 failed to start" "latest,previous,r2,r3" "$n2" "$n2" "$n2"
unset -f sc_compose
eval "$(declare -f orig_sc_compose | sed 's/^orig_sc_compose/sc_compose/')"

echo "== release 4: the COMPILER image build fails -> warning only; the runner updates"
FAIL_LAB=1 release r4
n4="$(image_id $runner r4)"
check "compiler not built" "$(sc_get $lab BUILT)" 0
check "runner built" "$(sc_get $runner BUILT)" 1
state $lab "r4 build failed" "latest,previous,r3" "$l3" "$l3" "$l3"
state $runner "r4" "latest,previous,r4" "$n4" "$n2" "$n4"

echo "== release 5: low memory -> both skipped entirely"
SIDECAR_AVAILABLE_MB=500 release r5
check "no r5 images" "$(image_id $lab r5)$(image_id $runner r5)" nonenone
state $lab "r5 low memory" "latest,previous,r3" "$l3" "$l3" "$l3"
state $runner "r5 low memory" "latest,previous,r4" "$n4" "$n4" "$n4"

echo "== release 6: both recover; old and failed images are pruned"
release r6
l6="$(image_id $lab r6)"; n6="$(image_id $runner r6)"
state $lab "r6" "latest,previous,r6" "$l6" "$l3" "$l6"
state $runner "r6" "latest,previous,r6" "$n6" "$n4" "$n6"

if [ "$fails" -ne 0 ]; then echo "$fails check(s) failed" >&2; exit 1; fi
echo "all sidecar deploy checks passed"
