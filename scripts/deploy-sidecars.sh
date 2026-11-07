# Optional sidecar services of the deploy (.github/workflows/deploy.yml): the Circuit Lab compiler
# (coms-lab-compiler) and the study code runner (coms-study-runner). Sourced, not executed.
#
# A sidecar must never be able to fail, block or roll back the main site: every step here tolerates
# failure and only prints a warning. The site's own build/up/health check/rollback stay in the
# workflow, and the workflow starts the site's services by name, so a sidecar is only ever started by
# sidecars_start, after the site is healthy. Needs: COMPOSE (docker compose command), NEW_TAG, and
# optionally
#   SIDECARS               services handled here (default: coms-lab-compiler coms-study-runner)
#   SIDECAR_COMPOSE_ARGS   compose arguments (default: --env-file .env -f docker-compose.yml)
#   SIDECAR_MIN_AVAILABLE_MB   skip all sidecars below this much available RAM (default 1200)
#   SIDECAR_AVAILABLE_MB       override the measured available RAM (tests)
#   SIDECAR_HEALTH_WAIT        seconds to wait for a started sidecar to report healthy (default 90)
# Per-service state (SC_<service>_<FIELD>, see sc_get/sc_set): BUILT (1 = NEW_TAG image exists),
# PREVIOUS (1 = the running image was snapshotted as <service>:previous), ACTIVATED (1 = the NEW_TAG
# image is the one running; only an activated release is promoted to `latest`).
# Global: SIDECARS_ENABLED (1 = memory allows).

SIDECARS="${SIDECARS:-coms-lab-compiler coms-study-runner}"
SIDECARS_ENABLED=0

# bash 3.2 has no associative arrays: state lives in variables named after the service.
sc_name() { printf 'SC_%s_%s' "$(printf '%s' "$1" | tr -c 'A-Za-z0-9\n' '_')" "$2"; }
sc_get() { local name; name="$(sc_name "$1" "$2")"; printf '%s' "${!name:-0}"; }
sc_set() { printf -v "$(sc_name "$1" "$2")" '%s' "$3"; }

sc_compose() { $COMPOSE ${SIDECAR_COMPOSE_ARGS:---env-file .env -f docker-compose.yml} "$@"; }
sc_warn() { echo "::warning::$1: $2" >&2; }

# Server headroom for the deploy log (no secrets), then decide whether the sidecars (768 MB limit each,
# plus their image builds) may be touched at all.
sidecars_diagnostics() {
  echo "--- server headroom ---"
  free -m 2>/dev/null || true
  df -h / 2>/dev/null || true
  echo "-----------------------"
  local available="${SIDECAR_AVAILABLE_MB:-$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}')}"
  if [ -z "$available" ]; then
    sc_warn "sidecars" "available memory unknown; continuing."
    SIDECARS_ENABLED=1
  elif [ "$available" -lt "${SIDECAR_MIN_AVAILABLE_MB:-1200}" ]; then
    sc_warn "sidecars" "only ${available} MB available (< ${SIDECAR_MIN_AVAILABLE_MB:-1200}); $SIDECARS are not built or started this deploy. The site is unaffected."
    SIDECARS_ENABLED=0
  else
    SIDECARS_ENABLED=1
  fi
}

# Before anything is replaced: remember the running image. None on the first deploy.
sc_snapshot_previous() {
  sc_set "$1" PREVIOUS 0
  if docker inspect "$1" >/dev/null 2>&1; then
    if docker tag "$(docker inspect -f '{{.Image}}' "$1")" "$1:previous"; then sc_set "$1" PREVIOUS 1; fi
  fi
}

sc_build() {
  sc_set "$1" BUILT 0
  sc_set "$1" ACTIVATED 0
  [ "$SIDECARS_ENABLED" = 1 ] || return 0
  if sc_compose build "$1"; then
    sc_set "$1" BUILT 1
  else
    sc_warn "$1" "image build failed; the site is deployed without updating it."
  fi
}

# Put the previous image back (used when the new one cannot start, and when the site rolls back).
sc_restore_previous() {
  if [ "$(sc_get "$1" PREVIOUS)" = 1 ]; then
    docker tag "$1:previous" "$1:latest" || true
    COMS_IMAGE_TAG=previous sc_compose up -d --no-build "$1" || sc_warn "$1" "could not restart the previous image."
  else
    # The release being rolled back to had no such service at all.
    sc_compose stop "$1" >/dev/null 2>&1 || true
  fi
}

# A container that has a healthcheck must report healthy within SIDECAR_HEALTH_WAIT seconds; one without a
# healthcheck counts as healthy as soon as it runs.
sc_wait_healthy() {
  local waited=0 status limit="${SIDECAR_HEALTH_WAIT:-90}"
  while :; do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1" 2>/dev/null || echo missing)"
    case "$status" in
      healthy|none) return 0 ;;
      unhealthy|missing) return 1 ;;
    esac
    [ "$waited" -ge "$limit" ] && return 1
    sleep 2
    waited=$((waited + 2))
  done
}

# After the site is healthy: start the new image and promote it only if it is up AND healthy. Otherwise fall
# back to the previous one and drop the failed image.
sc_start() {
  sc_set "$1" ACTIVATED 0
  [ "$(sc_get "$1" BUILT)" = 1 ] || return 0
  if sc_compose up -d --no-build "$1" && sc_wait_healthy "$1"; then
    sc_set "$1" ACTIVATED 1
  else
    sc_warn "$1" "the new container did not start or did not become healthy; restoring the previous one. \`latest\` stays on the previous image."
    sc_restore_previous "$1"
    docker rmi "$1:$NEW_TAG" >/dev/null 2>&1 || true
  fi
}

# After a rollback of the site: a sidecar goes back with it. It is only replaced after the site is
# healthy (sc_start), so normally there is nothing to undo and nothing is recreated.
sc_rollback() {
  [ "$(sc_get "$1" ACTIVATED)" = 1 ] && sc_restore_previous "$1"
  return 0
}

# Release is live: `latest` follows it; keep the live and previous images only. A release whose
# container did not start (or was not built) is not promoted: `latest` stays on what is running.
sc_finalize_tags() {
  if [ "$(sc_get "$1" ACTIVATED)" = 1 ] && docker image inspect "$1:$NEW_TAG" >/dev/null 2>&1; then
    docker tag "$1:$NEW_TAG" "$1:latest" || true
    docker image ls "$1" --format '{{.Tag}}' | while read -r tag; do
      case "$tag" in
        "$NEW_TAG"|previous|latest|"<none>") ;;
        *) docker rmi "$1:$tag" >/dev/null 2>&1 || true ;;
      esac
    done
  fi
}

# One call per workflow step, for every sidecar. A failure in one never stops the next.
sidecars_snapshot() { local s; for s in $SIDECARS; do sc_snapshot_previous "$s" || true; done; }
sidecars_build() { local s; for s in $SIDECARS; do sc_build "$s" || true; done; }
sidecars_rollback() { local s; for s in $SIDECARS; do sc_rollback "$s" || true; done; }
sidecars_start() { local s; for s in $SIDECARS; do sc_start "$s" || true; done; }
sidecars_finalize_tags() { local s; for s in $SIDECARS; do sc_finalize_tags "$s" || true; done; }
