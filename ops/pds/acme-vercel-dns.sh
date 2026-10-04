#!/bin/sh
# lego "exec" dns provider hook: answers DNS-01 challenges for the pds
# domains (lndry.me, lndry.social) through the vercel cli that is already
# logged in on this laptop, so no dns api token has to be copied anywhere.
#
# lego calls it as:  <script> present|cleanup <fqdn> <value>
# e.g.               present _acme-challenge.lndry.me. "abc..."
#
# usage (from the repo root; certificates land in ~/.local/share/lego-lndry):
#
#   EXEC_PATH="$PWD/ops/pds/acme-vercel-dns.sh" \
#   EXEC_PROPAGATION_TIMEOUT=300 EXEC_POLLING_INTERVAL=10 \
#   lego run --accept-tos --account-id laundryroom --dns exec \
#     --path ~/.local/share/lego-lndry -d lndry.me -d '*.lndry.me'
#
# then upload (the key never touches the repo):
#
#   cat ~/.local/share/lego-lndry/certificates/lndry.me.crt \
#       ~/.local/share/lego-lndry/certificates/lndry.me.key \
#     | ssh falkenstein 'tar ...'   # see ops/pds/README.md
#
# this is the stopgap from docs/atproto-plan.md (decision 11): renew by hand
# before day 60 until dns-01 runs on the box (open decision 4).
set -eu

action="$1"
fqdn="${2%.}"   # lego passes a trailing dot
value="$3"
scope="${VERCEL_SCOPE:-thefoodiespace}"

case "$fqdn" in
  *.lndry.me | lndry.me) domain="lndry.me" ;;
  *.lndry.social | lndry.social) domain="lndry.social" ;;
  *) echo "acme hook: refusing unexpected name $fqdn" >&2; exit 1 ;;
esac
name="${fqdn%."$domain"}"

case "$action" in
  present)
    # "--" because challenge values can start with "-"
    vercel dns add --scope "$scope" "$domain" "$name" TXT -- "$value" >/dev/null
    ;;
  cleanup)
    ids=$(vercel dns ls "$domain" --scope "$scope" 2>/dev/null |
      awk -v n="$name" -v v="$value" '$2 == n && $3 == "TXT" && index($0, v) { print $1 }')
    for id in $ids; do
      vercel dns rm "$id" --yes --scope "$scope" >/dev/null
    done
    ;;
  *)
    echo "acme hook: unknown action $action" >&2
    exit 1
    ;;
esac
