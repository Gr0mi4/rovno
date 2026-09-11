package com.rovno.app;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

public final class RatesJobService extends JobService {
    private static final int JOB_ID = 10701;
    private volatile JobParameters activeJob;
    private volatile boolean stopped;

    static void schedule(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler == null || scheduler.getPendingJob(JOB_ID) != null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(context, RatesJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(RatesRepository.REFRESH_INTERVAL_MS, 60 * 60 * 1000L)
                .setPersisted(true)
                .build();
        scheduler.schedule(job);
    }

    @Override public boolean onStartJob(JobParameters params) {
        activeJob = params;
        stopped = false;
        RatesRepository.get(this).refresh(false, () -> {
            if (!stopped && activeJob == params) {
                jobFinished(params, false);
                activeJob = null;
            }
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) {
        stopped = true;
        if (activeJob == params) activeJob = null;
        return true;
    }
}
