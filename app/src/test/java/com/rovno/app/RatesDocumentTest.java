package com.rovno.app;

import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;
import java.time.Instant;
import static org.junit.Assert.*;

public class RatesDocumentTest {
    private static final long NOW = Instant.parse("2026-09-11T12:00:00Z").toEpochMilli();
    // Deliberately synthetic test values, never bundled into the application.
    private static final String VALID = "{\"date\":\"2026-09-11\",\"usd\":{\"usd\":1,\"pln\":4,\"eur\":0.9,\"byn\":3,\"rub\":90,\"gbp\":0.8}}";

    @Test public void normalizesCodesAndPreservesSourceDate() throws Exception {
        RatesDocument document = RatesDocument.parse(VALID, NOW);
        assertEquals("2026-09-11", document.date.toString());
        assertEquals(4, document.rates.getDouble("PLN"), 0);
        assertEquals(0.8, document.rates.getDouble("GBP"), 0);
        assertFalse(document.rates.has("pln"));
        assertEquals(NOW, document.fetchedAt);
    }

    @Test public void cacheRoundTripAndOlderDateRemainVisible() throws Exception {
        RatesDocument document = RatesDocument.parse(VALID.replace("2026-09-11", "2026-09-01"), NOW);
        RatesDocument cached = RatesDocument.fromCache(document.toCache(), NOW + 86_400_000);
        assertEquals(document.date, cached.date);
        assertEquals(document.fetchedAt, cached.fetchedAt);
        assertEquals(document.rates.toString(), cached.rates.toString());
    }

    @Test public void rejectsMissingRequiredCurrency() {
        assertThrows(JSONException.class, () -> RatesDocument.parse(VALID.replace(",\"byn\":3", ""), NOW));
    }

    @Test public void rejectsUnexpectedBaseAndBadNumbers() {
        for (String replacement : new String[]{"0", "-2", "\"4\"", "null", "1e100"}) {
            assertThrows(JSONException.class, () -> RatesDocument.parse(VALID.replace("\"pln\":4", "\"pln\":" + replacement), NOW));
        }
        assertThrows(JSONException.class, () -> RatesDocument.parse(VALID.replace("\"usd\":1", "\"usd\":2"), NOW));
    }

    @Test public void rejectsInvalidAndFutureDates() {
        for (String date : new String[]{"2026-09-13", "2026-02-31", "11.09.2026", "2019-01-01"}) {
            assertThrows(JSONException.class, () -> RatesDocument.parse(VALID.replace("2026-09-11", date), NOW));
        }
    }

    @Test public void rejectsCorruptCacheTimestamp() throws Exception {
        JSONObject cache = new JSONObject(RatesDocument.parse(VALID, NOW).toCache());
        cache.put("fetchedAt", -1);
        assertThrows(JSONException.class, () -> RatesDocument.fromCache(cache.toString(), NOW));
    }

    @Test public void rejectsWrongEnvelopeAndNonJson() {
        assertThrows(JSONException.class, () -> RatesDocument.parse("<html>bad gateway</html>", NOW));
        assertThrows(JSONException.class, () -> RatesDocument.parse("{\"date\":\"2026-09-11\",\"error\":true}", NOW));
    }
}
