# Privacy policy for Rovno

Rovno (`com.rovno.app`) is a personal currency converter with a calculator. This document describes what data the app stores, what leaves the device, and how you can remove local data.

## Summary

- Amounts, expressions, currency order, and theme preferences stay on your device.
- The app does not include ads, analytics SDKs, accounts, payments, contacts, or location access.
- Network requests are limited to downloading public USD exchange-rate tables from two fixed HTTPS hosts.
- Those hosts receive a normal HTTPS request and may log standard connection metadata such as your IP address.

## Data stored on your device

Rovno stores the following locally in app-private storage:

- Your current calculator expression and selected source currency
- Your configured currency list and theme preference
- The last successfully downloaded exchange-rate snapshot and its fetch timestamp

This data is not uploaded to a Rovno backend because the project does not operate one.

## Network requests

When the app refreshes rates, Android downloads a public JSON document from one of these endpoints:

1. `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json`
2. `https://latest.currency-api.pages.dev/v1/currencies/usd.json`

The request is a generic table download. It does not include the amounts you type into the calculator.

The upstream project is [fawazahmed0/exchange-api](https://github.com/fawazahmed0/exchange-api), published under CC0. Rovno does not control those servers and cannot guarantee their logging or retention practices.

## WebView and external links

The user interface runs inside a hardened WebView that loads only packaged HTML, CSS, and JavaScript from the APK. External web pages cannot access the Android bridge.

The settings screen may open the upstream project page in your default browser. That action is explicit and leaves the app.

## Permissions

Rovno requests only `INTERNET`, `ACCESS_NETWORK_STATE` (required by Android for network-constrained background jobs), and `RECEIVE_BOOT_COMPLETED` (to reschedule background rate refresh). It does not request storage, contacts, camera, microphone, or location permissions.

## Retention and deletion

- Local calculator and settings data remain until you clear app data or uninstall the app.
- Cached exchange-rate snapshots remain until replaced by a newer successful download or removed when you clear app data.
- Uninstalling Rovno removes all app-local data.

## Children

Rovno is a general-purpose utility and does not knowingly collect personal information from children.

## Changes

This policy may be updated when networking, storage, or distribution behavior changes. The version shipped with each release reflects the behavior of that release.

## Contact

For privacy questions about this open-source project, open an issue at [github.com/Gr0mi4/rovno/issues](https://github.com/Gr0mi4/rovno/issues).
