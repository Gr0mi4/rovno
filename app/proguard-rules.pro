# The only native methods exposed to our packaged JavaScript.
-keepclassmembers class com.rovno.app.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
