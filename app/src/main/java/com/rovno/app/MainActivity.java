package com.rovno.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

public final class MainActivity extends Activity {
    static final String ASSET_HOST = "app.rovno.local";
    static final String START_URL = "https://" + ASSET_HOST + "/index.html";
    private final Handler main = new Handler(Looper.getMainLooper());
    private WebView webView;
    private FrameLayout container;
    private RatesRepository rates;
    private boolean pageReady;
    private final Runnable stateListener = this::sendState;
    private final Runnable periodicRefresh = new Runnable() {
        @Override public void run() {
            rates.refresh(false, null);
            main.postDelayed(this, RatesRepository.REFRESH_INTERVAL_MS);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        rates = RatesRepository.get(this);
        container = new FrameLayout(this);
        setContentView(container);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        else getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        container.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets safe = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout()
                        | WindowInsets.Type.ime());
                view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        webView = new WebView(this);
        container.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setHapticFeedbackEnabled(true);
        WebView.setWebContentsDebuggingEnabled((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        WebSettings settings = webView.getSettings();
        // Only packaged assets execute JavaScript; every network/subframe request is denied below.
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        applyWebViewTextZoom();
        CookieManager.getInstance().setAcceptCookie(false);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);
        webView.setWebViewClient(new LocalAssetsClient());
        webView.addJavascriptInterface(new Bridge(), "Android");
        applyTheme("dark");
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        webView.loadUrl(START_URL);
        RatesJobService.schedule(this);
        container.requestApplyInsets();
    }

    @Override public void onConfigurationChanged(Configuration configuration) {
        super.onConfigurationChanged(configuration);
        applyWebViewTextZoom();
    }

    @Override protected void onResume() {
        super.onResume();
        applyWebViewTextZoom();
        webView.onResume();
        rates.addListener(stateListener);
        rates.refresh(false, null);
        sendState();
        main.removeCallbacks(periodicRefresh);
        main.postDelayed(periodicRefresh, RatesRepository.REFRESH_INTERVAL_MS);
    }

    @Override protected void onPause() {
        rates.removeListener(stateListener);
        main.removeCallbacks(periodicRefresh);
        webView.onPause();
        super.onPause();
    }

    @Override protected void onDestroy() {
        main.removeCallbacksAndMessages(null);
        rates.removeListener(stateListener);
        container.removeView(webView);
        webView.removeJavascriptInterface("Android");
        webView.destroy();
        super.onDestroy();
    }

    @SuppressWarnings("deprecation")
    @Override public void onBackPressed() { handleBack(); }

    private void handleBack() {
        webView.evaluateJavascript("Boolean(window.onNativeBack && window.onNativeBack())", handled -> {
            if (!"true".equals(handled)) finish();
        });
    }

    private void sendState() {
        if (isFinishing() || isDestroyed() || !pageReady) return;
        webView.evaluateJavascript("window.onRatesUpdated && window.onRatesUpdated(" + rates.state() + ");", null);
    }

    private void applyWebViewTextZoom() {
        if (webView == null) return;
        float scale = getResources().getConfiguration().fontScale;
        int zoom = Math.round(100f * scale);
        webView.getSettings().setTextZoom(Math.max(85, Math.min(zoom, 200)));
    }

    private void applyTheme(String theme) {
        boolean light = "light".equals(theme);
        int color = Color.parseColor(light ? "#f2f3ec" : "#141a1b");
        container.setBackgroundColor(color);
        webView.setBackgroundColor(color);
        getWindow().setStatusBarColor(color);
        getWindow().setNavigationBarColor(color);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                int flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                controller.setSystemBarsAppearance(light ? flags : 0, flags);
            }
        } else {
            View decor = getWindow().getDecorView();
            int icons = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            decor.setSystemUiVisibility(light ? decor.getSystemUiVisibility() | icons
                    : decor.getSystemUiVisibility() & ~icons);
        }
    }

    public final class Bridge {
        @JavascriptInterface public String getState() { return rates.state(); }
        @JavascriptInterface public void refresh() { rates.refresh(true, null); }
        @JavascriptInterface public void copy(String text) {
            if (text == null || text.length() > 4096) return;
            main.post(() -> {
                ClipboardManager clipboard = getSystemService(ClipboardManager.class);
                if (clipboard != null) clipboard.setPrimaryClip(ClipData.newPlainText(getString(R.string.clipboard_label), text));
            });
        }
        @JavascriptInterface public void haptic() {
            main.post(() -> webView.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP));
        }
        @JavascriptInterface public void setTheme(String theme) { main.post(() -> applyTheme(theme)); }
        @JavascriptInterface public String getVersion() { return BuildConfig.VERSION_NAME; }
        @JavascriptInterface public void openSource() {
            main.post(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(RatesRepository.SOURCE_URL)));
                } catch (ActivityNotFoundException e) {
                    Toast.makeText(MainActivity.this, "На телефоне не найден браузер", Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    private final class LocalAssetsClient extends WebViewClient {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // External source links go through one fixed native ACTION_VIEW intent.
            return true;
        }
        @Override public boolean shouldOverrideUrlLoading(WebView view, String url) { return true; }

        @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!"https".equals(uri.getScheme()) || !ASSET_HOST.equals(uri.getHost())
                    || uri.getPort() != -1 || uri.getUserInfo() != null
                    || !"GET".equals(request.getMethod())) return denied();
            String path = uri.getPath();
            if (path == null || !path.matches("/[A-Za-z0-9_/-]+\\.(html|css|js|svg|png|woff2)")) return denied();
            String mime = path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css"
                    : path.endsWith(".js") ? "text/javascript" : path.endsWith(".svg") ? "image/svg+xml"
                    : path.endsWith(".png") ? "image/png" : "font/woff2";
            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Security-Policy", "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                    + "img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; "
                    + "base-uri 'none'; form-action 'none'");
            headers.put("X-Content-Type-Options", "nosniff");
            headers.put("Cache-Control", "no-store");
            try {
                return new WebResourceResponse(mime, "UTF-8", 200, "OK", headers,
                        getAssets().open(path.substring(1)));
            } catch (IOException e) {
                return denied();
            }
        }

        @Override public void onPageFinished(WebView view, String url) {
            pageReady = START_URL.equals(url);
            if (pageReady) sendState();
        }
    }

    private static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Blocked", new HashMap<>(),
                new ByteArrayInputStream(new byte[0]));
    }
}
