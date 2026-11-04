#!/bin/sh
# Builds the app image and keeps local Docker disk use bounded: only the newest codi-rebuild images stay,
# dangling layers go, and the build cache is capped. Docker Desktop's disk file never shrinks on its own,
# so leftover per-commit tags would otherwise pile up on C:.
#
# Usage: sh scripts/build-image.sh [tag] [--save]
#   tag     image tag, default: git short sha
#   --save  also write image.tar.gz for the release upload (docs/deployment.md)
# Env: KEEP_IMAGES (default 2) newest codi-rebuild images kept, BUILD_CACHE_MAX (default 5gb) build cache cap.
set -eu
cd "$(dirname "$0")/.."

tag=""
save=0
for arg in "$@"; do
  case "$arg" in
    --save) save=1 ;;
    *) tag=$arg ;;
  esac
done
[ -n "$tag" ] || tag=$(git rev-parse --short HEAD)
image="codi-rebuild:$tag"

docker build -t "$image" .

if [ "$save" = 1 ]; then
  docker save "$image" | gzip -1 > image.tar.gz
  echo "saved image.tar.gz ($image)"
fi

# `docker images` lists newest first. Keep the image just built, the KEEP_IMAGES newest, and any tag a container uses.
in_use=$(docker ps -a --format '{{.Image}}')
docker images codi-rebuild --format '{{.Repository}}:{{.Tag}}' | grep -v ':<none>$' | tail -n +"$((${KEEP_IMAGES:-2} + 1))" |
  while read -r old; do
    [ "$old" = "$image" ] && continue
    printf '%s\n' "$in_use" | grep -qx "$old" && continue
    docker rmi "$old" >/dev/null && echo "removed $old"
  done

docker image prune -f >/dev/null
docker builder prune -f --max-used-space "${BUILD_CACHE_MAX:-5gb}" >/dev/null
docker system df
