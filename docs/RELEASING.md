# Выпуск APK

Приложение: `com.rovno.app`. Для установки обновлений поверх предыдущей версии сохраняйте этот идентификатор и постоянный ключ подписи. При новом выпуске увеличивайте `versionCode`, меняйте `versionName` в `app/build.gradle` и имя файла в workflow.

## Постоянная подпись

Ключ создан 12 сентября 2026 с разрешения владельца. RSA 3072, APK Signature Scheme v2; минимальная версия Android 8.0.

Публичный SHA-256 сертификата подписи:

```text
5e6dfbfd407fa98aaf198234a0a2b35137fa11c82fe219f93580a5b025483e8f
```

В GitHub настроены зашифрованные Actions secrets: `ROVNO_KEYSTORE_BASE64`, `ROVNO_STORE_PASSWORD`, `ROVNO_KEY_ALIAS`, `ROVNO_KEY_PASSWORD`. Их значения отсутствуют в исходниках и отчётах. Они не передаются сборкам pull request. Временный keystore удаляется в конце CI-сборки.

Защищённая локальная резервная копия хранится вне Git-репозитория в `rovno-signing.dpapi`. Она зашифрована Windows DPAPI в режиме CurrentUser и проверена обратной расшифровкой. Для восстановления нужен исходный профиль Windows и его ключи DPAPI: обычное копирование этого файла на другой компьютер не даёт возможности расшифровать его. Перед переустановкой Windows перенесите ключ в отдельное защищённое переносимое хранилище. Не создавайте новый ключ для обычного обновления приложения.

## Проверка и публикация

1. Запустите workflow **Android APK** вручную с включённым `emulator`. Подписанная release-сборка и тестовое приложение будут собраны одним ключом.
2. Дождитесь успешных `build` и `emulator`. Эмулятор устанавливает именно release APK после R8, проверяет запуск, ввод `100 + 25 = 125`, мост Android и ограничения WebView. Артефакт `emulator-smoke-result` содержит результат и скриншот Android.
3. Скачайте APK из `rovno-release` **того же успешного запуска**. Выполните `apksigner verify --verbose --print-certs`, сверьте публичный отпечаток выше и SHA-256 файла.
4. Создайте тег версии на проверенном коммите. Опубликуйте в GitHub Releases только устанавливаемый APK и `SHA256SUMS.txt`; ключ, пароли, тестовое приложение и неподписанный APK туда не входят.
5. Обновите README и STATUS с фактическим результатом проверки. Реальный Google Pixel проверяет владелец: не заменяйте этот пункт проверкой эмулятора.

## Локальная сборка

Java 17 и Android SDK 35; задайте переменные `ROVNO_KEYSTORE`, `ROVNO_STORE_PASSWORD`, `ROVNO_KEY_ALIAS`, `ROVNO_KEY_PASSWORD` безопасным способом из локального защищённого хранилища.

```sh
./gradlew -PtestBuildType=release testDebugUnitTest lintRelease assembleRelease assembleReleaseAndroidTest
```

Результат: `app/build/outputs/apk/release/app-release.apk`. Тестовый APK: `app/build/outputs/apk/androidTest/release/app-release-androidTest.apk`. После сборки удалите временную расшифрованную копию keystore и очистите переменные с секретами.
