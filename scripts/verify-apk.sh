#!/usr/bin/env bash
set -euo pipefail

APK="${1:?apk path required}"
EXPECTED_FINGERPRINT="${2:?certificate sha-256 required}"
EXPECTED_PACKAGE="${3:?package name required}"
EXPECTED_VERSION_NAME="${4:?version name required}"
EXPECTED_VERSION_CODE="${5:?version code required}"

if [ ! -f "$APK" ]; then
  echo "APK not found: $APK" >&2
  exit 1
fi

BUILD_TOOLS="${ANDROID_HOME:-$ANDROID_SDK_ROOT}/build-tools"
LATEST_TOOLS="$(ls -1 "$BUILD_TOOLS" 2>/dev/null | sort -V | tail -n1 || true)"
if [ -z "$LATEST_TOOLS" ]; then
  echo "Android build-tools not found. Set ANDROID_HOME." >&2
  exit 1
fi

APKSIGNER="$BUILD_TOOLS/$LATEST_TOOLS/apksigner"
ZIPALIGN="$BUILD_TOOLS/$LATEST_TOOLS/zipalign"
AAPT2="$BUILD_TOOLS/$LATEST_TOOLS/aapt2"

"$ZIPALIGN" -c -v 4 "$APK" >/dev/null
CERTS="$("$APKSIGNER" verify --verbose --print-certs "$APK")"
echo "$CERTS"
if ! echo "$CERTS" | grep -qi "$EXPECTED_FINGERPRINT"; then
  echo "Unexpected signing certificate" >&2
  exit 1
fi
if echo "$CERTS" | grep -q 'CN=Android Debug'; then
  echo "Debug certificate detected" >&2
  exit 1
fi

BADGING="$("$AAPT2" dump badging "$APK")"
echo "$BADGING"
grep -Fq "package: name='$EXPECTED_PACKAGE'" <<< "$BADGING"
grep -Fq "versionName='$EXPECTED_VERSION_NAME'" <<< "$BADGING"
grep -Fq "versionCode='$EXPECTED_VERSION_CODE'" <<< "$BADGING"
grep -Fq "minSdkVersion:'26'" <<< "$BADGING"
grep -Fq "targetSdkVersion:'35'" <<< "$BADGING"
if grep -Fq "application-debuggable" <<< "$BADGING"; then
  echo "Debuggable application detected" >&2
  exit 1
fi

PERMISSIONS="$(awk -F"'" '/^uses-permission:/ {print $2}' <<< "$BADGING")"
for permission in $PERMISSIONS; do
  case "$permission" in
    android.permission.INTERNET|android.permission.ACCESS_NETWORK_STATE|android.permission.RECEIVE_BOOT_COMPLETED) ;;
    *)
      echo "Unexpected permission: $permission" >&2
      exit 1
      ;;
  esac
done

echo "APK verification passed for $EXPECTED_PACKAGE $EXPECTED_VERSION_NAME"
