#!/bin/sh
# Install dsh-reasoning-effort into a dsh profile as a REAL COPY.
#
# WHY A REAL COPY AND NOT A SYMLINK
# ---------------------------------
# This bundle has a Host half that Node actually imports, and that half imports
# `@deepseek-ai/schemastery`. Node resolves a symlinked package to its realpath,
# which lands outside the profile — where `@deepseek-ai/*` is not on the
# resolution path — so the import fails with ERR_MODULE_NOT_FOUND. A real copy
# under the profile's node_modules makes normal node_modules archaeology walk up
# to the dsh installation's packages.
#
# (The Client half would be fine either way: the Host serves `client.js` by path
# and the browser bundle imports nothing but `react` from the shell's seed table.)
#
# RE-RUN THIS after editing index.js or client.js: the profile holds a packed
# snapshot, so HMR watches that copy, not this working tree. No dsh restart and
# no page refresh are needed afterwards — dsh-client-hmr stat-polls every loaded
# bundle's artifact and hot-swaps it within about a second.
#
# Usage:
#   sh install.sh --dsh-root /path/to/dsh
#   sh install.sh --dsh-root /path/to/dsh --profile web
#   DSH_HOME=/path/to/dsh/.dsh sh install.sh
#   sh install.sh --uninstall
#
# Exit codes: 0 ok, 1 environment problem, 2 usage problem.
set -eu

BUNDLE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
BUNDLE_NAME=$(node -p "require('$BUNDLE/package.json').name")

PROFILE=${PROFILE:-${DSH_PROFILE:-web}}
DSH_ROOT=${DSH_ROOT:-}
UNINSTALL=0

usage() {
  sed -n '2,27p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --dsh-root) DSH_ROOT=${2:-}; shift 2 ;;
    --profile) PROFILE=${2:-}; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "install: unknown option $1" >&2; usage >&2; exit 2 ;;
  esac
done

# Resolve the profile directory. An explicit --dsh-root/DSH_ROOT wins over the
# ambient DSH_HOME, so `--dsh-root /elsewhere` never silently targets the real
# installation.
if [ -z "$DSH_ROOT" ] && [ -n "${DSH_HOME:-}" ]; then
  DSH_ROOT=$(CDPATH= cd -- "$DSH_HOME/.." && pwd -P)
fi
if [ -z "$DSH_ROOT" ] && [ -n "${DSH_PROFILE_DIR:-}" ]; then
  PROFILE_DIR=$(CDPATH= cd -- "$DSH_PROFILE_DIR" && pwd -P)
  DSH_ROOT=$(CDPATH= cd -- "$PROFILE_DIR/../../.." && pwd -P)
fi
# Last resort: walk up from here looking for a dsh installation.
if [ -z "$DSH_ROOT" ]; then
  dir=$(pwd -P)
  while :; do
    if [ -f "$dir/node_modules/@deepseek-ai/dsh/package.json" ]; then DSH_ROOT=$dir; break; fi
    parent=$(dirname "$dir")
    [ "$parent" = "$dir" ] && break
    dir=$parent
  done
fi

if [ -z "$DSH_ROOT" ]; then
  echo "install: could not find a dsh installation." >&2
  echo "         Pass one explicitly:  sh install.sh --dsh-root /path/to/dsh" >&2
  echo "         (that is the directory containing node_modules/@deepseek-ai/dsh)" >&2
  exit 1
fi
DSH_ROOT=$(CDPATH= cd -- "$DSH_ROOT" && pwd -P)
PROFILE_DIR="$DSH_ROOT/.dsh/profiles/$PROFILE"
MANIFEST="$PROFILE_DIR/package.json"
TARGET="$PROFILE_DIR/node_modules/$BUNDLE_NAME"

if [ ! -f "$MANIFEST" ]; then
  echo "install: no profile '$PROFILE' at $PROFILE_DIR" >&2
  echo "         initialize it first, e.g.  cd $DSH_ROOT && ./dsh --profile $PROFILE --help" >&2
  exit 1
fi

# The install below removes $TARGET, so prove it is inside this profile first.
case "$TARGET" in
  "$PROFILE_DIR"/node_modules/*) ;;
  *) echo "install: refusing to touch $TARGET" >&2; exit 1 ;;
esac

if [ "$UNINSTALL" = 1 ]; then
  rm -rf "$TARGET"
  node -e '
    const fs = require("node:fs");
    const [file, name] = process.argv.slice(1);
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    delete manifest.dependencies?.[name];
    const bundles = manifest.dsh?.profile?.bundles;
    if (Array.isArray(bundles)) manifest.dsh.profile.bundles = bundles.filter((entry) => entry !== name);
    fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  ' "$MANIFEST" "$BUNDLE_NAME"
  echo "uninstalled $BUNDLE_NAME from profile '$PROFILE'"
  echo "restart dsh for the change to take effect"
  exit 0
fi

# Pack and extract, so the profile gets a real directory rather than a symlink.
# The template is passed explicitly: macOS mktemp consults the Darwin user temp
# directory rather than $TMPDIR unless one is given, and dsh confines its own
# shells to a $TMPDIR inside the installation.
TMPBASE=${TMPDIR:-/tmp}
TMP=$(mktemp -d "${TMPBASE%/}/dsh-reasoning-effort.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
pnpm --dir "$BUNDLE" pack --pack-destination "$TMP" >/dev/null
tar -xzf "$TMP"/*.tgz -C "$TMP"
rm -rf "$TARGET"
mkdir -p "$(dirname -- "$TARGET")"
mv "$TMP/package" "$TARGET"
echo "installed real copy -> $TARGET"

# Register the bundle. Last position = highest precedence among bundle layers.
node -e '
  const fs = require("node:fs");
  const [file, name, link] = process.argv.slice(1);
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  manifest.dependencies ??= {};
  if (manifest.dependencies[name] !== link) {
    manifest.dependencies[name] = link;
    console.log(`added   dependencies["${name}"] = "${link}"`);
  }
  manifest.dsh ??= {};
  manifest.dsh.profile ??= {};
  const bundles = (manifest.dsh.profile.bundles ??= []);
  if (!bundles.includes(name)) {
    bundles.push(name);
    console.log(`added   dsh.profile.bundles += "${name}"`);
  }
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
' "$MANIFEST" "$BUNDLE_NAME" "link:$BUNDLE"

echo
echo "profile '$PROFILE' bundles:"
node -p "'  ' + require('$MANIFEST').dsh.profile.bundles.join('\n  ')"
echo
echo "restart dsh, then open Settings -> Models and pick a provider card."
echo "the editor appears at the bottom of the card, headed \"Reasoning effort\"."
