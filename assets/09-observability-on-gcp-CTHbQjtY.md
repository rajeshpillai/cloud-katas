# Observability on GCP

## Overview

This lesson exercises Google Cloud's observability stack against the sample app running on GKE. You will inspect logs, build a log-based metric, define an SLI/SLO around the app's `/healthz` success rate, attach an alert to that SLO, and connect Cloud Trace at the concept level.

Most cloud teams already collect data. The skill is asking the right question of it. Each step here builds toward a single specific question — "is the app working from the user's perspective?" — answered with metrics, logs, and SLOs.

## Estimated Time

- 90 minutes

## Prerequisites

- Completed [Google Kubernetes Engine (GKE)](03-google-kubernetes-engine-gke.md)
- The sample app running on GKE with the load balancer reachable
- `gcloud` authenticated and the `cloud-katas` configuration active

> **Background you need (brush-up):** New to any of these? Skim the linked primer — the lab won't stop to explain them.
>
> - [CLI & data formats](../primers/cli-and-data-formats.md) — the Cloud Logging filter syntax (`resource.type="…" AND jsonPayload.x="…"`), shell loops for the load generator, and jsonpath.
> - HTTP status classes (2xx success, 4xx client error, 5xx server error) drive the SLO — this lesson defines them where used.

## Cost Notice

Cloud Logging and Monitoring have free tiers that comfortably cover this lab. SLOs are part of Monitoring at no extra cost. Cloud Trace's free quota covers the small volume here.

## Learning Objectives

- Read structured logs and saved log queries in Cloud Logging
- Create a log-based metric from a JSON log field
- Define an SLI based on the `/healthz` success rate
- Create an SLO with a rolling window and an error-budget burn-rate alert
- Identify where Cloud Trace fits in a request flow

## Core Concepts

- Pillars of observability: Metrics show what changed (rates and gauges). Logs show what happened (events with context). Traces show where time was spent (request spans across services).
- Structured vs unstructured logs: A line of free text is hard to query at scale. JSON logs let log-based metrics extract fields directly, no regex needed.
- Log-based metrics: A counter or distribution computed from log entries that match a filter. They are billed per log entry processed and can extract numeric fields (`extractor`).
- SLI vs SLO vs error budget: An SLI is a measurement (success rate). An SLO is the target (99.5% over 28 days). The error budget is the inverse — how much failure you can absorb before the SLO is at risk.
- Burn rate alerts: Alert on the rate at which the error budget is being consumed, not on every spike. Multi-burn-rate alerts catch both fast outages and slow degradation.
- Traces and sampling: Traces are typically sampled (1-10%) to keep cost down. Force sampling on a few requests during debugging with a header.

## Lab

### 1. Prepare

```bash
gcloud config configurations activate cloud-katas
export PROJECT_ID=$(gcloud config get-value project)

gcloud services enable logging.googleapis.com monitoring.googleapis.com cloudtrace.googleapis.com

kubectl config use-context "$(kubectl config get-contexts -o name | grep learning-gke || kubectl config current-context)"
```

Confirm the sample app is running.

```bash
kubectl -n sample get deployment sample
EXTERNAL_IP=$(kubectl -n sample get service sample -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "$EXTERNAL_IP"
```

### 2. Drive Traffic and Inspect Logs

In one terminal, drive a small load with a 10% error rate to make the data interesting.

```bash
while true; do
  if [ $((RANDOM % 10)) -eq 0 ]; then
    curl -s -o /dev/null "http://$EXTERNAL_IP/this-path-will-not-match"
  else
    curl -s -o /dev/null "http://$EXTERNAL_IP/healthz"
  fi
  sleep 0.5
done
```

(The sample app returns 200 for any path, but you can edit it to 404 unknown paths if you want real errors. For the SLO that follows, we will count the `/healthz` requests specifically.)

In another terminal, query logs.

```bash
gcloud logging read \
  'resource.type="k8s_container" AND resource.labels.namespace_name="sample" AND severity!=DEBUG' \
  --limit=10 --format="value(jsonPayload, textPayload)" --freshness=5m
```

In the Logs Explorer UI, save this query as "sample app — last 5m".

### 3. Create a Log-Based Metric

Create a counter for `/healthz` requests.

```bash
gcloud logging metrics create sample_healthz_requests \
  --description="Count of /healthz requests served by sample" \
  --log-filter='resource.type="k8s_container"
    AND resource.labels.namespace_name="sample"
    AND jsonPayload.path="/healthz"'
```

Verify it shows up:

```bash
gcloud logging metrics describe sample_healthz_requests
```

In Cloud Monitoring's Metrics Explorer, query `logging.googleapis.com/user/sample_healthz_requests`.

### 4. Define an SLI and an SLO

The SLI: success rate of `/healthz` requests. Operationally, success is HTTP 200. The sample app returns 200 for `/healthz`, so for a real SLI you would lean on the LB's `loadbalancing.googleapis.com/https/request_count` filtered by response code class.

Create the SLO via API by writing it to a file (`slo.json`) and applying it. The API is verbose; the UI is friendlier for a first pass — open Monitoring > SLOs and create:

- Service: select the GKE sample service (auto-detected once traffic flows).
- Indicator type: Request-based.
- Good: `response_code_class = 200`.
- Total: all responses.
- Target: 99.5%.
- Rolling window: 28 days.

After creation, an SLO dashboard shows current attainment and remaining error budget.

### 5. Add a Burn-Rate Alert

In the SLO detail page, attach an alert with two burn rates:

- Fast: budget burn at 14.4x over a 1-hour window (catches outages).
- Slow: budget burn at 1x over a 24-hour window (catches degradations).

Configure a notification channel (email is fine for the lab) and save.

Trigger the alert briefly by spiking 4xx/5xx responses — the easiest way is to scale the deployment to 0 temporarily.

```bash
kubectl -n sample scale deployment sample --replicas=0
sleep 60
kubectl -n sample scale deployment sample --replicas=2
```

In Monitoring > Alerting, watch the alert fire and resolve.

### 6. Quick Look at Cloud Trace

Cloud Trace requires instrumentation in your application code. The sample app does not yet emit spans, but here is the request flow you would see if it did:

- Cloud HTTP LB → forwarded request
- GKE Service → pod
- Pod handler span: `GET /healthz`
- Outbound: any downstream service the pod calls

In your app, OpenTelemetry instrumentation auto-creates spans; you set `OTEL_EXPORTER_OTLP_ENDPOINT` to a collector that forwards to Cloud Trace. We do not add this in the lab; the concept is the takeaway.

### 7. Log Export and Sinks

For longer retention or external analysis, route logs to BigQuery or GCS via a log sink.

```bash
gcloud logging sinks create sample-bigquery \
  bigquery.googleapis.com/projects/$PROJECT_ID/datasets/sample_logs \
  --log-filter='resource.labels.namespace_name="sample"' \
  --use-partitioned-tables 2>&1 || echo "needs bigquery dataset; concept-only here"
```

The dataset must exist first. Most teams create the sink + dataset together via Terraform.

## Validate

```bash
gcloud logging metrics describe sample_healthz_requests
gcloud alpha monitoring slos list --service-id=ANY_SERVICE_ID 2>&1 | tail -20
gcloud logging read 'logName:"sample"' --limit=1 --freshness=5m
```

Success means:

- The log-based metric exists and reports a non-zero rate.
- An SLO exists with a 99.5% target and a 28-day rolling window.
- A burn-rate alert is wired up and was observed firing during the scale-to-zero test.
- The saved log query returns recent JSON-structured entries.

## Troubleshooting

- Log-based metric returns zero: The filter is too strict. Run the filter in Logs Explorer first and confirm it returns rows.
- SLO shows `--`: Not enough traffic yet, or the request-based metric expected `loadbalancing` data that has not arrived. Give it 5-10 minutes after the LB is healthy.
- Alert never fires: The fast burn window is shorter than the data ingestion delay. Use the slow window to catch the test or extend the simulated outage.
- Cloud Trace empty: No spans are being emitted. Trace needs in-app instrumentation; metrics and logs alone do not produce traces.
- Log sink permissions: The sink's writer identity needs `bigquery.dataEditor` on the destination dataset.

## Cleanup

```bash
gcloud logging metrics delete sample_healthz_requests --quiet
# Delete the SLO via the Monitoring UI (no stable CLI yet)
# Remove any test notification channels
```

If you scaled the deployment to zero earlier, leave it scaled back to the original replica count for any later lessons.

## Checkpoint

- Explain the difference between an SLI and an SLO in one sentence each.
- Describe why burn-rate alerts are preferred over fixed-threshold alerts on raw error rate.
- Identify the difference between Logs Explorer queries and log-based metrics.
- Explain why Trace coverage is usually sampled rather than complete.

## Further Reading

- [Cloud Monitoring](https://cloud.google.com/monitoring/docs)
- [Cloud Logging](https://cloud.google.com/logging/docs)
- [SLO concepts](https://sre.google/sre-book/service-level-objectives/)
- [Cloud Trace](https://cloud.google.com/trace/docs)
- [Log-based metrics](https://cloud.google.com/logging/docs/logs-based-metrics)
