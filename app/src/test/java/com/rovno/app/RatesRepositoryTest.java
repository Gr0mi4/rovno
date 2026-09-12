package com.rovno.app;

import android.content.Context;

import androidx.test.core.app.ApplicationProvider;

import org.json.JSONException;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class RatesRepositoryTest {
    private static final String VALID = "{\"date\":\"2026-09-11\",\"usd\":{\"usd\":1,\"pln\":4,\"eur\":0.9,\"byn\":3,\"rub\":90}}";
    private Context context;

    @Before public void setUp() {
        context = ApplicationProvider.getApplicationContext();
        context.getSharedPreferences("daily_rates_v1", Context.MODE_PRIVATE).edit().clear().commit();
        RatesRepository.resetForTests();
    }

    @After public void tearDown() {
        RatesRepository.resetForTests();
    }

    @Test public void refreshStoresLatestSnapshotFromFetcher() throws Exception {
        Map<String, String> responses = new HashMap<>();
        responses.put(RatesRepository.ENDPOINTS[0], VALID);
        RatesRepository.bodyFetcher = endpoint -> {
            String response = responses.get(endpoint);
            if (response == null) throw new IOException("unavailable");
            return response;
        };
        RatesRepository repository = RatesRepository.get(context);
        repository.refresh(true, null);
        String stateText = awaitRefresh(repository);
        assertNotNull(stateText);
        assertTrue(stateText.contains("\"date\":\"2026-09-11\""));
        assertFalse(stateText.contains("\"refreshing\":true"));
    }

    @Test public void refreshKeepsCachedSnapshotWhenAllEndpointsFail() throws Exception {
        String cache = RatesDocument.parse(VALID.replace("2026-09-11", "2026-09-10"), System.currentTimeMillis()).toCache();
        context.getSharedPreferences("daily_rates_v1", Context.MODE_PRIVATE).edit().putString("document", cache).commit();
        RatesRepository.resetForTests();
        RatesRepository.bodyFetcher = endpoint -> { throw new IOException("offline"); };
        RatesRepository repository = RatesRepository.get(context);
        repository.refresh(true, null);
        String stateText = awaitRefresh(repository);
        assertTrue(stateText.contains("Не удалось обновить курсы"));
        assertTrue(stateText.contains("\"date\":\"2026-09-10\""));
    }

    private static String awaitRefresh(RatesRepository repository) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 3_000;
        String state;
        do {
            state = repository.state();
            if (!state.contains("\"refreshing\":true")) return state;
            Thread.sleep(10);
        } while (System.currentTimeMillis() < deadline);
        throw new AssertionError("Repository refresh timed out");
    }
}
