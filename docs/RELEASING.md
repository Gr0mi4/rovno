# Releasing Rovno

Application ID: `com.rovno.app`. Keep this ID and the release signing key unchanged so users can install updates over an existing APK.

Version source of truth: `versionCode` and `versionName` in `app/build.gradle`. The release workflow creates the matching tag only after all gates pass (`0.1.0` → `v0.1.0`).

## Signing certificate

Release key created on 12 September 2026 with owner approval. RSA 3072, APK Signature Scheme v2. Minimum Android 8.0 (API 26).

Public SHA-256 fingerprint:

```text
5e6dfbfd407fa98aaf198234a0a2b35137fa11c82fe219f93580a5b025483e8f
```

GitHub Actions secrets (protected `release` environment only):

- `ROVNO_KEYSTORE_BASE64`
- `ROVNO_STORE_PASSWORD`
- `ROVNO_KEY_ALIAS`
- `ROVNO_KEY_PASSWORD`

Secrets are never available to pull-request CI. The decrypted keystore is removed at the end of the release job.

A Windows DPAPI backup exists outside the repository (`rovno-signing.dpapi`). Create a second portable encrypted backup before relying on it as the only recovery path.

## Workflows

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | Push to `main`, pull requests | JS tests, JVM unit tests, lint — **no signing** |
| `release.yml` | Manual dispatch from `main` | Signed APK, verification, emulator smoke, tag, GitHub Release |

### Release gate (fail-closed)

A release run fails without creating a tag if any of the following is true:

- A signing secret is missing
- The signed APK is not produced
- `scripts/verify-apk.sh` rejects package, version, zipalign, debuggable flag, permissions, or certificate fingerprint
- Emulator smoke on API 26 or API 35 fails

There is no unsigned fallback on the release path.

## Publish a version

1. Bump `versionCode` and `versionName` in `app/build.gradle`.
2. Merge to `main` and confirm `CI` is green.
3. In GitHub Actions, open **Release**, select **Run workflow**, and choose `main`.
4. Wait for all release gates. The final job creates the version tag and GitHub Release atomically.
5. Download `rovno.apk` from the GitHub Release (not the Actions artifact).
6. Verify locally:
   ```sh
   sha256sum -c SHA256SUMS.txt
   scripts/verify-apk.sh rovno.apk \
     5e6dfbfd407fa98aaf198234a0a2b35137fa11c82fe219f93580a5b025483e8f \
     com.rovno.app 0.1.0 1
   ```
7. Complete [DEVICE_CHECKLIST.md](DEVICE_CHECKLIST.md) on a physical Pixel.
8. Update `STATUS.md` with verification results.

Permanent download URL pattern:

```text
https://github.com/Gr0mi4/rovno/releases/latest/download/rovno.apk
```

## Local signed build

Java 17 and Android SDK 35. Provide signing variables from secure local storage only:

```sh
export ROVNO_KEYSTORE=/path/to/release.jks
export ROVNO_STORE_PASSWORD=...
export ROVNO_KEY_ALIAS=...
export ROVNO_KEY_PASSWORD=...
./gradlew -PtestBuildType=release testDebugUnitTest lintRelease assembleRelease assembleReleaseAndroidTest
scripts/verify-apk.sh app/build/outputs/apk/release/app-release.apk \
  5e6dfbfd407fa98aaf198234a0a2b35137fa11c82fe219f93580a5b025483e8f \
  com.rovno.app 0.1.0 1
```

Remove any decrypted keystore copy and clear secret variables after the build.
