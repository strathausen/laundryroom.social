#!/bin/sh
# One-time setup of a pds (atproto personal data server) as a dokku app on
# falkenstein. Runs ON the box (as root); every secret is generated there and
# never leaves it. See docs/atproto-plan.md, "ops prerequisites".
#
#   ssh falkenstein 'sh -s' < ops/pds/setup-pds.sh -- pds-me pds.lndry.me lndry.me
#   ssh falkenstein 'sh -s' < ops/pds/setup-pds.sh -- pds-social pds.lndry.social lndry.social
#
# then upload the wildcard certificate (see ops/pds/README.md) and deploy:
#
#   ssh falkenstein "dokku git:from-image <app> $IMAGE"
#
# Re-running is refused once the app exists, so secrets are never regenerated
# by accident (a new rotation key or jwt secret would break every account).
set -eu

[ "${1:-}" = "--" ] && shift
APP="$1"          # dokku app name, e.g. pds-me
HOST="$2"         # PDS_HOSTNAME, e.g. pds.lndry.me ("pds" is a reserved handle)
DOMAIN="$3"       # handle domain, e.g. lndry.me (handles: <name>.lndry.me)

if dokku apps:exists "$APP" >/dev/null 2>&1; then
  echo "setup-pds: $APP already exists, refusing to touch it" >&2
  exit 1
fi

hex() { openssl rand -hex "$1"; }
# secp256k1 private key as 64 hex chars (no xxd on the box)
rotation_key() {
  openssl ecparam -name secp256k1 -genkey -noout -outform DER |
    tail -c +8 | head -c 32 | od -An -tx1 | tr -d ' \n'
}

ROT="$(rotation_key)"
[ "${#ROT}" -eq 64 ] || { echo "setup-pds: bad rotation key length" >&2; exit 1; }

dokku apps:create "$APP"
# the alpha image runs as USER node (uid 1000) and declares VOLUME /app/data
dokku storage:ensure-directory --chown heroku "$APP"
dokku storage:mount "$APP" "/var/lib/dokku/data/storage/$APP:/app/data"
# never two pds processes on the same sqlite files: stop the old container
# before starting the new one (a few seconds of downtime per upgrade)
dokku checks:disable "$APP"

dokku config:set --no-restart "$APP" \
  PDS_HOSTNAME="$HOST" \
  PDS_SERVICE_HANDLE_DOMAINS=".$DOMAIN" \
  PDS_PORT=3000 \
  PDS_DATA_DIRECTORY=/app/data \
  PDS_BLOBSTORE_DISK_LOCATION=/app/data/blocks \
  PDS_BLOB_UPLOAD_LIMIT=10485760 \
  PDS_JWT_SECRET="$(hex 16)" \
  PDS_ADMIN_PASSWORD="$(hex 16)" \
  PDS_DPOP_SECRET="$(hex 32)" \
  PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX="$ROT" \
  PDS_DID_PLC_URL=https://plc.directory \
  PDS_BSKY_APP_VIEW_URL=https://api.bsky.app \
  PDS_BSKY_APP_VIEW_DID=did:web:api.bsky.app \
  PDS_REPORT_SERVICE_URL=https://mod.bsky.app \
  PDS_REPORT_SERVICE_DID=did:plc:ar7c4by46qjdydhdevvrndac \
  PDS_CRAWLERS=https://bsky.network \
  PDS_INVITE_REQUIRED=true \
  PDS_RATE_LIMITS_ENABLED=true \
  PDS_SERVICE_NAME=laundryroom \
  PDS_HOME_URL=https://www.laundryroom.social \
  PDS_PRIVACY_POLICY_URL=https://www.laundryroom.social/en/pages/privacy_policy \
  PDS_TERMS_OF_SERVICE_URL=https://www.laundryroom.social/en/pages/terms \
  LOG_ENABLED=true >/dev/null
unset ROT

dokku domains:set "$APP" "$DOMAIN" "*.$DOMAIN"
dokku ports:set "$APP" http:80:3000
dokku nginx:set "$APP" client-max-body-size 12m
dokku nginx:set "$APP" proxy-read-timeout 3600s
dokku nginx:set "$APP" proxy-send-timeout 3600s

echo "setup-pds: $APP configured for $HOST (handles *.$DOMAIN)."
echo "setup-pds: next: certs:add, then dokku git:from-image $APP <image>."
echo "setup-pds: copy the rotation key to the password manager now:"
echo "           dokku config:get $APP PDS_PLC_ROTATION_KEY_K256_PRIVATE_KEY_HEX"
