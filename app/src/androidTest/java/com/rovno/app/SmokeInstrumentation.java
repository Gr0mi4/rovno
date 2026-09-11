package com.rovno.app;

import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** Standalone framework instrumentation; succeeds without rates or network connectivity. */
public final class SmokeInstrumentation extends Instrumentation {
    @Override public void onCreate(Bundle arguments) { super.onCreate(arguments); start(); }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            Intent launch = new Intent(getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Activity activity = startActivitySync(launch);
            waitForIdleSync();
            AtomicReference<WebView> found = new AtomicReference<>();
            runOnMainSync(() -> found.set(findWebView(activity.getWindow().getDecorView())));
            WebView web = found.get();
            if (web == null) throw new AssertionError("WebView was not created");
            boolean ready = false;
            for (int attempt = 0; attempt < 100; attempt++) {
                String value = evaluate(web, "Boolean(document.readyState === 'complete' && document.body && document.body.innerText.includes('PLN') && typeof Android.getState === 'function')");
                if ("true".equals(value)) { ready = true; break; }
                Thread.sleep(100);
            }
            if (!ready) throw new AssertionError("Packaged currency UI did not render");
            if (!"true".equals(evaluate(web, "document.querySelectorAll('#keypad [data-key]').length === 20"))) {
                throw new AssertionError("Calculator keypad is incomplete");
            }
            String entered = evaluate(web, "(() => { for (const key of ['AC', '1', '0', '0']) { [...document.querySelectorAll('[data-key]')].find(b => b.dataset.key === key).click(); } return document.getElementById('expression').textContent === '100' && document.getElementById('input-label').textContent.includes('PLN'); })()");
            if (!"true".equals(entered)) throw new AssertionError("Entering 100 PLN did not work");
            String calculated = evaluate(web, "(() => { for (const key of ['+', '2', '5', '=']) { [...document.querySelectorAll('[data-key]')].find(b => b.dataset.key === key).click(); } return document.getElementById('expression').textContent === '125'; })()");
            if (!"true".equals(calculated)) throw new AssertionError("100 + 25 should equal 125");
            if (!"true".equals(evaluate(web, "typeof JSON.parse(Android.getState()).refreshing === 'boolean'"))) {
                throw new AssertionError("Native state bridge returned an invalid envelope");
            }
            runOnMainSync(() -> {
                if (web.getSettings().getAllowFileAccess() || web.getSettings().getAllowContentAccess()
                        || web.getSettings().getAllowUniversalAccessFromFileURLs()) {
                    throw new AssertionError("Unsafe WebView file access enabled");
                }
            });
            runOnMainSync(activity::finish);
            result.putString("stream", "Rovno smoke passed: packaged UI rendered, calculator 100 + 25 = 125, native bridge available, file access denied.\n");
            finish(Activity.RESULT_OK, result);
        } catch (Throwable error) {
            result.putString("shortMsg", error.toString());
            result.putString("stream", "Rovno smoke failed: " + error + "\n");
            finish(Activity.RESULT_CANCELED, result);
        }
    }

    private String evaluate(WebView web, String expression) throws InterruptedException {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        runOnMainSync(() -> web.evaluateJavascript(expression, value -> { result.set(value); latch.countDown(); }));
        if (!latch.await(5, TimeUnit.SECONDS)) throw new AssertionError("JavaScript timed out");
        return result.get();
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int index = 0; index < group.getChildCount(); index++) {
                WebView web = findWebView(group.getChildAt(index));
                if (web != null) return web;
            }
        }
        return null;
    }
}
