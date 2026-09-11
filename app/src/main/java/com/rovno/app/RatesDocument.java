package com.rovno.app;

import org.json.JSONException;
import org.json.JSONObject;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Iterator;

/** Validated daily USD-base rates. Never creates sample or guessed rates. */
final class RatesDocument {
    static final String PROVIDER = "Currency API";
    private static final String[] REQUIRED = {"USD", "PLN", "EUR", "BYN", "RUB"};
    final JSONObject rates;
    final LocalDate date;
    final long fetchedAt;

    private RatesDocument(JSONObject rates, LocalDate date, long fetchedAt) {
        this.rates = rates;
        this.date = date;
        this.fetchedAt = fetchedAt;
    }

    static RatesDocument parse(String body, long now) throws JSONException {
        JSONObject json = new JSONObject(body);
        LocalDate date = parseDate(json.getString("date"), now);
        JSONObject source = json.getJSONObject("usd");
        JSONObject clean = new JSONObject();
        Iterator<String> keys = source.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            if (!key.matches("[a-z]{3}")) continue;
            Object value = source.get(key);
            if (!(value instanceof Number)) throw new JSONException("Non-numeric rate");
            double rate = ((Number) value).doubleValue();
            if (!Double.isFinite(rate) || rate <= 0 || rate > 1e15) {
                throw new JSONException("Invalid rate");
            }
            clean.put(key.toUpperCase(java.util.Locale.ROOT), rate);
        }
        validateRates(clean);
        return new RatesDocument(clean, date, now);
    }

    static RatesDocument fromCache(String body, long now) throws JSONException {
        JSONObject cache = new JSONObject(body);
        LocalDate date = parseDate(cache.getString("date"), now);
        JSONObject rates = cache.getJSONObject("rates");
        validateRates(rates);
        long fetchedAt = cache.getLong("fetchedAt");
        if (fetchedAt <= 0 || fetchedAt > now + 86_400_000L) {
            throw new JSONException("Invalid cache timestamp");
        }
        return new RatesDocument(rates, date, fetchedAt);
    }

    String toCache() throws JSONException {
        return new JSONObject().put("date", date.toString()).put("rates", rates)
                .put("fetchedAt", fetchedAt).toString();
    }

    private static LocalDate parseDate(String text, long now) throws JSONException {
        try {
            if (!text.matches("\\d{4}-\\d{2}-\\d{2}")) throw new IllegalArgumentException();
            LocalDate date = LocalDate.parse(text);
            LocalDate today = java.time.Instant.ofEpochMilli(now).atOffset(ZoneOffset.UTC).toLocalDate();
            if (date.isAfter(today.plusDays(1)) || date.isBefore(LocalDate.of(2020, 1, 1))) {
                throw new IllegalArgumentException();
            }
            return date;
        } catch (RuntimeException e) {
            throw new JSONException("Invalid rates date");
        }
    }

    private static void validateRates(JSONObject rates) throws JSONException {
        Iterator<String> keys = rates.keys();
        while (keys.hasNext()) {
            String code = keys.next();
            Object value = rates.get(code);
            if (!code.matches("[A-Z]{3}") || !(value instanceof Number)) {
                throw new JSONException("Invalid currency code or rate");
            }
            double rate = ((Number) value).doubleValue();
            if (!Double.isFinite(rate) || rate <= 0 || rate > 1e15) throw new JSONException("Invalid rate");
        }
        for (String code : REQUIRED) {
            if (!rates.has(code)) throw new JSONException("Missing required rate: " + code);
        }
        if (Math.abs(rates.getDouble("USD") - 1.0) > 1e-10) {
            throw new JSONException("Unexpected base rate");
        }
    }
}
