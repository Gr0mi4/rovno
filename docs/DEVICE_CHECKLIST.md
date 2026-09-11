# Device validation checklist

Use this checklist after a signed release candidate is built. Emulator smoke tests run automatically in the release workflow; this document covers manual validation on a physical device.

## Install and upgrade

- [ ] Download `rovno.apk` from the GitHub Release (not a temporary Actions artifact).
- [ ] Verify `sha256sum -c SHA256SUMS.txt`.
- [ ] Verify signing certificate SHA-256 matches [RELEASING.md](RELEASING.md).
- [ ] Fresh install on Google Pixel succeeds.
- [ ] Upgrade install over the previous signed build succeeds without uninstalling.

## First launch and offline behavior

- [ ] First launch with network: rates load and date is shown.
- [ ] First launch offline: no fabricated rates; error state is understandable.
- [ ] Relaunch offline after a successful fetch: cached rates and date are shown.

## Calculator and currencies

- [ ] Enter `100 + 25 =` → `125`.
- [ ] `200 − 15 % =` → `170`.
- [ ] Switch source currency; equivalent amount is preserved.
- [ ] Copy button copies useful precision (not always two decimals).
- [ ] Currency without a rate cannot be selected as active.

## Accessibility and layout

- [ ] TalkBack reads expression, amounts, and keypad labels.
- [ ] System font scale 1.3×, 1.5×, and 2× remain usable.
- [ ] Compact height (320–360 dp) and landscape: keypad and `=` remain reachable.
- [ ] Light and dark themes readable (contrast acceptable).

## System integration

- [ ] Back closes settings sheet before exiting app.
- [ ] Rotation and split-screen preserve state.
- [ ] IME/search in currency picker works.
- [ ] External link opens in browser; WebView does not navigate externally.

## Background refresh

- [ ] Manual refresh works on demand.
- [ ] Background refresh respects Android battery restrictions (may be delayed).

Record device model, Android version, APK SHA-256, and pass/fail notes in the release issue or STATUS update.
