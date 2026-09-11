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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

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
        RatesRepository.bodyFetcher = responses::get;
        AtomicReference<String> stateText = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        RatesRepository repository = RatesRepository.get(context);
        repository.refresh(true, () -> {
            stateText.set(repository.state());
            latch.countDown();
        });
        assertTrue(latch.await(3, TimeUnit.SECONDS));
        assertNotNull(stateText.get());
        assertTrue(stateText.get().contains("\"date\":\"2026-09-11\""));
        assertFalse(stateText.get().contains("\"refreshing\":true"));
    }

    @Test public void refreshKeepsCachedSnapshotWhenAllEndpointsFail() throws Exception {
        RatesRepository.bodyFetcher = endpoint -> { throw new IOException("offline"); };
        String cache = RatesDocument.parse(VALID.replace("2026-09-11", "2026-09-10"), System.currentTimeMillis()).toCache();
        context.getSharedPreferences("daily_rates_v1", Context.MODE_PRIVATE).edit().putString("document", cache).commit();
        RatesRepository.resetForTests();
        RatesRepository repository = RatesRepository.get(context);
        AtomicReference<String> stateText = new AtomicReference<>();
        CountDownLatch latch = new CountDownLatch(1);
        repository.refresh(true, () -> {
            stateText.set(repository.state());
            latch.countDown();
        });
        assertTrue(latch.await(3, TimeUnit.SECONDS));
        assertTrue(stateText.get().contains("Не удалось обновить курсы"));
        assertTrue(stateText.get().contains("\"date\":\"2026-09-10\""));
    }
}
