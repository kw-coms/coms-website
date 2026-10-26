#!/bin/sh
# Daily PostgreSQL backup loop for the db-backup service in docker-compose.yml.
#
# Runs inside a postgres:16-alpine container. Connection settings come from the standard
# libpq variables (PGHOST, PGUSER, PGPASSWORD, PGDATABASE) set by docker-compose.yml.
# Each dump is written in pg_dump's custom format (compressed, restorable with pg_restore)
# to /backups, which is a host directory outside the repository checkout.
#
# Restore steps are in docs/operations/backup-and-rollback.md.
set -eu

# Dumps hold member names, student numbers and phone numbers: owner-only permissions.
umask 077

keep_days="${BACKUP_KEEP_DAYS:-14}"
interval="${BACKUP_INTERVAL_SECONDS:-86400}"
backup_dir=/backups

# Hand finished files to whoever owns the backup directory (the deploy user), so they can be
# copied off the server without sudo.
owner="$(stat -c '%u:%g' "$backup_dir")"

until pg_isready -q; do
  echo "db-backup: waiting for the database"
  sleep 5
done

while :; do
  stamp="$(date +%Y%m%dT%H%M%S)"
  partial="$backup_dir/.daily-$stamp.dump.partial"
  final="$backup_dir/daily-$stamp.dump"

  if pg_dump --format=custom --file="$partial" && [ -s "$partial" ]; then
    mv "$partial" "$final"
    chown "$owner" "$final" 2>/dev/null || true
    echo "db-backup: wrote $(basename "$final") ($(du -h "$final" | cut -f1))"
  else
    rm -f "$partial"
    echo "db-backup: backup FAILED at $stamp" >&2
  fi

  # Keep two weeks by default. Pre-deploy dumps (predeploy-*.dump) are pruned by the deploy.
  find "$backup_dir" -maxdepth 1 -type f -name 'daily-*.dump' -mtime +"$keep_days" -delete

  # Uploaded files (post images, archive files) are not in the database. Archive them too, but
  # only while the disk has room for three more copies: a full disk would take the site down,
  # which is worse than a missed upload archive. Only the two newest archives are kept.
  if [ -d /uploads ]; then
    need_kb="$(du -sk /uploads | cut -f1)"
    free_kb="$(df -Pk "$backup_dir" | awk 'NR==2 {print $4}')"
    if [ "$((need_kb * 3))" -lt "$free_kb" ]; then
      partial="$backup_dir/.uploads-$stamp.tar.gz.partial"
      if tar czf "$partial" -C /uploads .; then
        mv "$partial" "$backup_dir/uploads-$stamp.tar.gz"
        chown "$owner" "$backup_dir/uploads-$stamp.tar.gz" 2>/dev/null || true
        echo "db-backup: wrote uploads-$stamp.tar.gz"
      else
        rm -f "$partial"
        echo "db-backup: uploads archive FAILED at $stamp" >&2
      fi
      ls -1t "$backup_dir"/uploads-*.tar.gz 2>/dev/null | tail -n +3 | xargs -r rm -f
    else
      echo "db-backup: skipped the uploads archive, not enough free disk space" >&2
    fi
  fi

  sleep "$interval"
done
