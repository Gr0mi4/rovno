package com.rovno.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class RatesRepository {
    interface BodyFetcher {
        String fetch(String endpoint) throws IOException;
    }

    static final long REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000L;
    static final String SOURCE_URL = "https://github.com/fawazahmed0/exchange-api";
    static final String[] ENDPOINTS = {
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
            "https://latest.currency-api.pages.dev/v1/currencies/usd.json"
    };
    private static final int MAX_BODY = 512 * 1024;
    private static RatesRepository instance;
    static BodyFetcher bodyFetcher = RatesRepository::download;
    private final SharedPreferences preferences;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final CopyOnWriteArrayList<Runnable> listeners = new CopyOnWriteArrayList<>();
    private final List<Runnable> completions = new ArrayList<>();
    private RatesDocument document;
    private String error;
    private boolean refreshing;
    private long lastAttempt = -1;

    static synchronized RatesRepository get(Context context) {
        if (instance == null) instance = new RatesRepository(context.getApplicationContext());
        return instance;
    }

    static synchronized void resetForTests() {
        instance = null;
        bodyFetcher = RatesRepository::download;
    }

    private RatesRepository(Context context) {
        preferences = context.getSharedPreferences("daily_rates_v1", Context.MODE_PRIVATE);
        String cached = preferences.getString("document", null);
        if (cached != null) {
            try {
                document = RatesDocument.fromCache(cached, System.currentTimeMillis());
            } catch (JSONException e) {
                error = "Не удалось прочитать сохранённые курсы. Обновите их через интернет.";
            }
        }
    }

    void addListener(Runnable listener) { listeners.add(listener); }
    void removeListener(Runnable listener) { listeners.remove(listener); }

    synchronized String state() {
        JSONObject state = new JSONObject();
        try {
            state.put("rates", document == null ? JSONObject.NULL : document.rates);
            state.put("date", document == null ? JSONObject.NULL : document.date.toString());
            state.put("provider", document == null ? JSONObject.NULL : RatesDocument.PROVIDER);
            state.put("fetchedAt", document == null ? JSONObject.NULL : document.fetchedAt);
            state.put("error", error == null ? JSONObject.NULL : error);
            state.put("refreshing", refreshing);
        } catch (JSONException impossible) {
            throw new IllegalStateException(impossible);
        }
        return state.toString();
    }

    void refresh(boolean manual, Runnable completed) {
        synchronized (this) {
            if (refreshing) {
                if (completed != null) completions.add(completed);
                return;
            }
            long elapsed = SystemClock.elapsedRealtime();
            long now = System.currentTimeMillis();
            boolean tooSoon = lastAttempt >= 0 && elapsed - lastAttempt < 60_000;
            boolean fresh = document != null && now >= document.fetchedAt
                    && now - document.fetchedAt < REFRESH_INTERVAL_MS;
            if (tooSoon || (!manual && fresh)) {
                if (completed != null) main.post(completed);
                notifyListeners();
                return;
            }
            lastAttempt = elapsed;
            refreshing = true;
            error = null;
            if (completed != null) completions.add(completed);
        }
        notifyListeners();
        executor.execute(this::fetch);
    }

    private void fetch() {
        RatesDocument result = null;
        for (String endpoint : ENDPOINTS) {
            try {
                RatesDocument candidate = RatesDocument.parse(bodyFetcher.fetch(endpoint), System.currentTimeMillis());
                synchronized (this) {
                    if (document != null && candidate.date.isBefore(document.date)) {
                        throw new IOException("Endpoint returned an older snapshot");
                    }
                }
                if (result == null || candidate.date.isAfter(result.date)) result = candidate;
                java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneOffset.UTC);
                if (!result.date.isBefore(today)) break;
            } catch (IOException | JSONException ignored) {
                // The second URL is a mirror of the same provider and format.
            }
        }
        List<Runnable> finished;
        synchronized (this) {
            if (result != null) {
                document = result;
                error = null;
                try {
                    if (!preferences.edit().putString("document", result.toCache()).commit()) {
                        error = "Курсы обновлены, но не удалось сохранить их для работы без интернета.";
                    }
                } catch (JSONException impossible) {
                    error = "Не удалось сохранить курсы.";
                }
            } else {
                error = document == null
                        ? "Не удалось загрузить курсы. Проверьте интернет и нажмите обновить."
                        : "Не удалось обновить курсы. Показаны сохранённые данные.";
            }
            refreshing = false;
            finished = new ArrayList<>(completions);
            completions.clear();
        }
        notifyListeners();
        for (Runnable callback : finished) main.post(callback);
    }

    private void notifyListeners() {
        for (Runnable listener : listeners) main.post(listener);
    }

    private static String download(String endpoint) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        try {
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(12_000);
            connection.setInstanceFollowRedirects(false);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "Rovno/" + BuildConfig.VERSION_NAME + " Android");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IOException("HTTP failure");
            if (connection.getContentLengthLong() > MAX_BODY) throw new IOException("Response too large");
            try (InputStream stream = connection.getInputStream();
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = stream.read(buffer)) != -1) {
                    if (output.size() + count > MAX_BODY) throw new IOException("Response too large");
                    output.write(buffer, 0, count);
                }
                return output.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            connection.disconnect();
        }
    }
}
