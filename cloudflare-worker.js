const STADIUM = {
  name: "Flagler Credit Union Stadium",
  latitude: 26.37528,
  longitude: -80.10028,
};

// Xweather's free developer allowance resets on the account-creation day.
// This account's usage cycle is configured to begin on UTC day 10.
const XWEATHER_CYCLE_DAY = 10;
const XWEATHER_ACCESS_LIMIT = 14500; // Leave a 500-access reserve below the 15,000 limit.
const XWEATHER_REQUEST_COST = 10;
const NORMAL_POLL_SECONDS = 60;
const ACTIVE_POLL_SECONDS = 30;
const ALL_CLEAR_MINUTES = 30;

// The Worker, not the browser, enforces when paid lightning requests are allowed.
const COVERAGE_WINDOWS = [
  {
    id: "2026-09-11-mens-soccer-charlotte",
    label: "MEN'S SOCCER · CHARLOTTE",
    kickoff: "2026-09-11T23:00:00Z",
    start: "2026-09-11T19:00:00Z",
    end: "2026-09-12T03:00:00Z",
  },
  {
    id: "2026-09-12-football-navy",
    label: "FOOTBALL · NAVY",
    kickoff: "2026-09-12T23:30:00Z",
    start: "2026-09-12T19:30:00Z",
    end: "2026-09-13T03:30:00Z",
  },
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://howpomp.github.io",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Accept, Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function activeWindow(nowMs) {
  return COVERAGE_WINDOWS.find((event) => nowMs >= Date.parse(event.start) && nowMs <= Date.parse(event.end));
}

function nextWindow(nowMs) {
  return COVERAGE_WINDOWS.find((event) => Date.parse(event.start) > nowMs) || null;
}

function cycleKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const cycleStart = now.getUTCDate() >= XWEATHER_CYCLE_DAY
    ? new Date(Date.UTC(year, month, XWEATHER_CYCLE_DAY))
    : new Date(Date.UTC(year, month - 1, XWEATHER_CYCLE_DAY));
  return cycleStart.toISOString().slice(0, 10);
}

async function readJson(kv, key, fallback) {
  try {
    const value = await kv.get(key, "json");
    return value == null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function publicEvent(event) {
  if (!event) return null;
  return {
    id: event.id,
    label: event.label,
    kickoff: event.kickoff,
    coverageStart: event.start,
    coverageEnd: event.end,
  };
}

function baseLightningResponse(nowMs, usage, event) {
  return {
    stadium: STADIUM,
    event: publicEvent(event),
    checkedAt: new Date(nowMs).toISOString(),
    usage: {
      cycle: cycleKey(new Date(nowMs)),
      accesses: usage.accesses || 0,
      safetyLimit: XWEATHER_ACCESS_LIMIT,
      providerLimit: 15000,
    },
    attribution: "Powered by Vaisala Xweather",
  };
}

function pulseTime(pulse) {
  const seconds = Number(pulse?.ob?.timestamp);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const parsed = Date.parse(pulse?.ob?.dateTimeISO || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function strikeSummary(pulse, nowMs) {
  if (!pulse) return null;
  const timestampMs = pulseTime(pulse);
  return {
    id: String(pulse.id || ""),
    timestamp: timestampMs ? new Date(timestampMs).toISOString() : null,
    ageSeconds: timestampMs ? Math.max(0, Math.round((nowMs - timestampMs) / 1000)) : null,
    distanceMiles: Number(pulse?.relativeTo?.distanceMI),
    bearingDegrees: Number(pulse?.relativeTo?.bearing),
    direction: String(pulse?.relativeTo?.bearingENG || "").toUpperCase(),
    type: String(pulse?.ob?.pulse?.type || "").toUpperCase(),
    peakAmps: Number(pulse?.ob?.pulse?.peakamp),
  };
}

async function fetchLightning(request, env, nowMs, usage, previous, event) {
  const requestUrl = new URL(request.url);
  const providerUrl = new URL("https://data.api.xweather.com/lightning/closest");
  providerUrl.searchParams.set("p", `${STADIUM.latitude},${STADIUM.longitude}`);
  providerUrl.searchParams.set("radius", "15mi");
  providerUrl.searchParams.set("limit", "1000");
  providerUrl.searchParams.set("client_id", env.XWEATHER_CLIENT_ID);
  providerUrl.searchParams.set("client_secret", env.XWEATHER_CLIENT_SECRET);

  const providerResponse = await fetch(providerUrl, {
    headers: {
      Accept: "application/json",
      Origin: requestUrl.origin,
      Referer: `${requestUrl.origin}/`,
      "User-Agent": "FAU-Weather-Ops/1.0",
    },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  const providerData = await providerResponse.json().catch(() => null);
  if (!providerResponse.ok || !providerData?.success) {
    const message = providerData?.error?.description || providerData?.error?.message || `Xweather ${providerResponse.status}`;
    throw new Error(message);
  }

  const pulses = Array.isArray(providerData.response) ? providerData.response : [];
  const valid = pulses
    .filter((pulse) => Number.isFinite(Number(pulse?.relativeTo?.distanceMI)))
    .sort((a, b) => pulseTime(b) - pulseTime(a));
  const within8 = valid.filter((pulse) => Number(pulse.relativeTo.distanceMI) <= 8);
  const within15 = valid.filter((pulse) => Number(pulse.relativeTo.distanceMI) <= 15);
  const outerRing = within15.filter((pulse) => Number(pulse.relativeTo.distanceMI) > 8);
  const nearest = [...within15].sort((a, b) => Number(a.relativeTo.distanceMI) - Number(b.relativeTo.distanceMI))[0] || null;
  const latest = within15[0] || null;

  const newest8Ms = within8.reduce((latestMs, pulse) => Math.max(latestMs, pulseTime(pulse)), 0);
  const newest15Ms = within15.reduce((latestMs, pulse) => Math.max(latestMs, pulseTime(pulse)), 0);
  const lastWithin8Ms = Math.max(Number(previous.lastWithin8Ms || 0), newest8Ms);
  const lastWithin15Ms = Math.max(Number(previous.lastWithin15Ms || 0), newest15Ms);
  const elevated = lastWithin15Ms > 0 && nowMs - lastWithin15Ms < ALL_CLEAR_MINUTES * 60000;

  const nextUsage = {
    cycle: cycleKey(new Date(nowMs)),
    accesses: Number(usage.accesses || 0) + XWEATHER_REQUEST_COST,
    updatedAt: new Date(nowMs).toISOString(),
  };
  const result = {
    ...baseLightningResponse(nowMs, nextUsage, event),
    status: within8.length ? "warning" : outerRing.length ? "caution" : "clear",
    sourceFetchedAt: new Date(nowMs).toISOString(),
    pollSeconds: elevated ? ACTIVE_POLL_SECONDS : NORMAL_POLL_SECONDS,
    windowMinutes: 5,
    counts: {
      within8Miles: within8.length,
      from8To15Miles: outerRing.length,
      within15Miles: within15.length,
    },
    nearest: strikeSummary(nearest, nowMs),
    latest: strikeSummary(latest, nowMs),
    lastWithin8: lastWithin8Ms ? new Date(lastWithin8Ms).toISOString() : null,
    lastWithin15: lastWithin15Ms ? new Date(lastWithin15Ms).toISOString() : null,
    allClearAt: lastWithin8Ms ? new Date(lastWithin8Ms + ALL_CLEAR_MINUTES * 60000).toISOString() : null,
  };

  await Promise.all([
    env.FAU_WEATHER_STATE.put(`usage:${nextUsage.cycle}`, JSON.stringify(nextUsage)),
    env.FAU_WEATHER_STATE.put(`lightning:${event.id}`, JSON.stringify({
      ...result,
      lastWithin8Ms,
      lastWithin15Ms,
    }), { expirationTtl: 86400 }),
  ]);
  return result;
}

async function lightning(request, env) {
  const nowMs = Date.now();
  const event = activeWindow(nowMs);
  const usageCycle = cycleKey(new Date(nowMs));
  const usage = await readJson(env.FAU_WEATHER_STATE, `usage:${usageCycle}`, { cycle: usageCycle, accesses: 0 });

  if (!event) {
    return json({
      ...baseLightningResponse(nowMs, usage, null),
      status: "off_schedule",
      pollSeconds: NORMAL_POLL_SECONDS,
      nextEvent: publicEvent(nextWindow(nowMs)),
    });
  }

  const previous = await readJson(env.FAU_WEATHER_STATE, `lightning:${event.id}`, {});
  const lastWithin15Ms = Number(previous.lastWithin15Ms || 0);
  const elevated = lastWithin15Ms > 0 && nowMs - lastWithin15Ms < ALL_CLEAR_MINUTES * 60000;
  const pollSeconds = elevated ? ACTIVE_POLL_SECONDS : NORMAL_POLL_SECONDS;
  const fetchedMs = Date.parse(previous.sourceFetchedAt || "");
  if (Number.isFinite(fetchedMs) && nowMs - fetchedMs < pollSeconds * 1000) {
    return json({ ...previous, checkedAt: new Date(nowMs).toISOString(), cached: true });
  }

  if (Number(usage.accesses || 0) + XWEATHER_REQUEST_COST > XWEATHER_ACCESS_LIMIT) {
    return json({
      ...baseLightningResponse(nowMs, usage, event),
      status: "limit_reached",
      pollSeconds: NORMAL_POLL_SECONDS,
      lastGood: previous.sourceFetchedAt ? previous : null,
    }, 429);
  }

  if (!env.XWEATHER_CLIENT_ID || !env.XWEATHER_CLIENT_SECRET) {
    return json({
      ...baseLightningResponse(nowMs, usage, event),
      status: "configuration_error",
      message: "Xweather secrets are not configured.",
    }, 503);
  }

  try {
    const result = await fetchLightning(request, env, nowMs, usage, previous, event);
    return json(result);
  } catch (error) {
    return json({
      ...baseLightningResponse(nowMs, usage, event),
      status: "provider_error",
      pollSeconds: NORMAL_POLL_SECONDS,
      message: error instanceof Error ? error.message : "Lightning provider unavailable",
      lastGood: previous.sourceFetchedAt ? previous : null,
    }, 502);
  }
}

async function metars(request) {
  const url = new URL(request.url);
  const ids = String(url.searchParams.get("ids") || "KBCT,KPMP,KFXE")
    .toUpperCase()
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^K[A-Z0-9]{3}$/.test(id))
    .slice(0, 8);
  const upstream = new URL("https://aviationweather.gov/api/data/metar");
  upstream.searchParams.set("ids", ids.join(","));
  upstream.searchParams.set("format", "json");
  upstream.searchParams.set("hours", "2");
  const response = await fetch(upstream, { headers: { Accept: "application/json", "User-Agent": "FAU-Weather-Ops/1.0" } });
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "x-proxy-fetched-at": new Date().toISOString() },
  });
}

async function nhc() {
  const response = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
    headers: { Accept: "application/json", "User-Agent": "FAU-Weather-Ops/1.0" },
  });
  const body = await response.text();
  return new Response(body, {
    status: response.status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "x-proxy-fetched-at": new Date().toISOString() },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    if (path === "/lightning") return lightning(request, env);
    if (path === "/metars") return metars(request);
    if (path === "/nhc") return nhc();
    if (path === "/health" || path === "/") {
      return json({
        ok: true,
        service: "FAU weather data proxy",
        routes: ["/metars", "/nhc", "/lightning"],
        lightningConfigured: Boolean(env.XWEATHER_CLIENT_ID && env.XWEATHER_CLIENT_SECRET && env.FAU_WEATHER_STATE),
        coverageWindows: COVERAGE_WINDOWS.map(publicEvent),
      });
    }
    return json({ error: "Not found" }, 404);
  },
};
