# Circuit Lab compiler steps of the deploy (.github/workflows/deploy.yml). Sourced, not executed.
#
# The compiler (coms-lab-compiler) must never be able to fail, block or roll back the main site:
# every step here tolerates failure and only prints a warning. The site's own build/up/health check/
# rollback stay in the workflow. Needs: COMPOSE (docker compose command), NEW_TAG, and optionally
#   LAB_COMPOSE_ARGS       compose arguments (default: --env-file .env -f docker-compose.yml)
#   LAB_MIN_AVAILABLE_MB   skip the compiler below this much available RAM (default 1200)
#   LAB_AVAILABLE_MB       override the measured available RAM (tests)
# State: LAB_ENABLED (1 = memory allows), LAB_BUILT (1 = NEW_TAG image exists), LAB_PREVIOUS (1 = a
# previous compiler image was snapshotted as coms-lab-compiler:previous).

LAB_SERVICE=coms-lab-compiler
LAB_ENABLED=0
LAB_BUILT=0
LAB_PREVIOUS=0

lab_compose() { $COMPOSE ${LAB_COMPOSE_ARGS:---env-file .env -f docker-compose.yml} "$@"; }
lab_warn() { echo "::warning::Circuit Lab compiler: $*" >&2; }

# Server headroom for the deploy log (no secrets), then decide whether the compiler (768 MB limit,
# plus its image build) may be touched at all.
lab_diagnostics() {
  echo "--- server headroom ---"
  free -m 2>/dev/null || true
  df -h / 2>/dev/null || true
  echo "-----------------------"
  local available="${LAB_AVAILABLE_MB:-$(free -m 2>/dev/null | awk '/^Mem:/ {print $7}')}"
  if [ -z "$available" ]; then
    lab_warn "available memory unknown; continuing."
    LAB_ENABLED=1
  elif [ "$available" -lt "${LAB_MIN_AVAILABLE_MB:-1200}" ]; then
    lab_warn "only ${available} MB available (< ${LAB_MIN_AVAILABLE_MB:-1200}); the compiler is not built or started this deploy. The site is unaffected."
    LAB_ENABLED=0
  else
    LAB_ENABLED=1
  fi
}

# Before anything is replaced: remember the running compiler image. None on the first deploy.
lab_snapshot_previous() {
  LAB_PREVIOUS=0
  if docker inspect "$LAB_SERVICE" >/dev/null 2>&1; then
    if docker tag "$(docker inspect -f '{{.Image}}' "$LAB_SERVICE")" "$LAB_SERVICE:previous"; then LAB_PREVIOUS=1; fi
  fi
}

lab_build() {
  LAB_BUILT=0
  [ "$LAB_ENABLED" = 1 ] || return 0
  if lab_compose build "$LAB_SERVICE"; then
    LAB_BUILT=1
  else
    lab_warn "image build failed; the site is deployed without updating the compiler."
  fi
}

# Put the previous compiler image back (used when the new one cannot start, and when the site rolls back).
lab_restore_previous() {
  if [ "$LAB_PREVIOUS" = 1 ]; then
    docker tag "$LAB_SERVICE:previous" "$LAB_SERVICE:latest" || true
    COMS_IMAGE_TAG=previous lab_compose up -d --no-build "$LAB_SERVICE" \
      || lab_warn "could not restart the previous compiler image."
  else
    # The release being rolled back to had no compiler at all.
    lab_compose stop "$LAB_SERVICE" >/dev/null 2>&1 || true
  fi
}

# After the site is healthy: start the new compiler. On failure fall back to the previous one.
lab_start() {
  [ "$LAB_BUILT" = 1 ] || return 0
  if ! lab_compose up -d --no-build "$LAB_SERVICE"; then
    lab_warn "the new compiler did not start; restoring the previous one."
    lab_restore_previous
  fi
}

# After a rollback of the site: the compiler goes back with it.
lab_rollback() {
  [ "$LAB_BUILT" = 1 ] && lab_restore_previous
  return 0
}

# Release is live: `latest` follows it; keep the live and previous images only.
lab_finalize_tags() {
  if [ "$LAB_BUILT" = 1 ] && docker image inspect "$LAB_SERVICE:$NEW_TAG" >/dev/null 2>&1; then
    docker tag "$LAB_SERVICE:$NEW_TAG" "$LAB_SERVICE:latest" || true
    docker image ls "$LAB_SERVICE" --format '{{.Tag}}' | while read -r tag; do
      case "$tag" in
        "$NEW_TAG"|previous|latest|"<none>") ;;
        *) docker rmi "$LAB_SERVICE:$tag" >/dev/null 2>&1 || true ;;
      esac
    done
  fi
}
