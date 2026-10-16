#!/usr/bin/env bash
set -euo pipefail

: "${DB_PATH:?Set DB_PATH to the absolute path of the SQLite database}"
: "${S3_BACKUP_URI:?Set S3_BACKUP_URI to an s3:// bucket URI}"

if [[ "$DB_PATH" != /* || ! -f "$DB_PATH" ]]; then
  printf 'DB_PATH must be an existing absolute file path: %s\n' "$DB_PATH" >&2
  exit 1
fi

if [[ "$S3_BACKUP_URI" != s3://* ]]; then
  printf 'S3_BACKUP_URI must start with s3://\n' >&2
  exit 1
fi

command -v sqlite3 >/dev/null || {
  printf 'sqlite3 CLI is required for online SQLite backups\n' >&2
  exit 1
}
command -v aws >/dev/null || {
  printf 'AWS CLI is required to upload backups to S3\n' >&2
  exit 1
}

umask 077
backup_file="$(mktemp --suffix=.sqlite "/tmp/my-savings-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
trap 'rm -f -- "$backup_file"' EXIT

sqlite3 "$DB_PATH" ".backup $backup_file"
aws s3 cp "$backup_file" "${S3_BACKUP_URI%/}/$(basename -- "$backup_file")" --only-show-errors
