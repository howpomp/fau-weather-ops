(function () {
  "use strict";
  const C = window.FAU_CONFIG;
  const API = "https://api.weather.gov";
  const state = { observations: "loading", forecast: "loading", alerts: "loading", afd: "loading", tropics: "loading" };
  const $ = (id) => document.getElementById(id);
  const fmtTime = (d, options = {}) => new Intl.DateTimeFormat("en-US", { timeZone: C.stadium.timezone, hour: "numeric", minute: "2-digit", ...options }).format(d);
  const fmtDate = (d) => new Intl.DateTimeFormat("en-US", { timeZone: C.stadium.timezone, weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(d).toUpperCase();
  const safe = (value, fallback = "—") => value === null || value === undefined || Number.isNaN(value) ? fallback : value;
  const cToF = (c) => c == null ? null : (c * 9 / 5) + 32;
  const kmhToMph = (v) => v == null ? null : v * 0.621371;
  const mToMi = (v) => v == null ? null : v * 0.000621371;
  const paToInHg = (v) => v == null ? null : v * 0.0002953;
  const round = (v) => v == null ? null : Math.round(v);
  const one = (v) => v == null ? null : Number(v).toFixed(2);

  function request(url) {
    return fetch(url, { headers: { Accept: "application/geo+json" }, cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      return r.json();
    });
  }

  function dataAge(date) {
    const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
    const level = minutes < C.freshnessMinutes.current ? "current" : minutes <= C.freshnessMinutes.stale ? "late" : "stale";
    return { minutes, level, label: minutes < 1 ? "NOW" : `${minutes}M` };
  }

  function windCompass(deg) {
    if (deg == null) return "VRB";
    const points = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    return points[Math.round(deg / 22.5) % 16];
  }

  function trend(current, previous, threshold) {
    if (current == null || previous == null || Math.abs(current - previous) < threshold) return "";
    return current > previous ? '<span class="trend up" aria-label="rising">↑</span>' : '<span class="trend down" aria-label="falling">↓</span>';
  }

  function ceiling(layers) {
    if (!Array.isArray(layers)) return "—";
    const layer = layers.find((x) => ["BKN", "OVC", "VV"].includes(x.amount));
    return layer?.base?.value == null ? "—" : `${layer.amount}${String(Math.round(layer.base.value / 30.48)).padStart(3, "0")}`;
  }

  function presentWeather(items) {
    if (!Array.isArray(items) || !items.length) return "—";
    return items.map((w) => [w.intensity, w.weather, w.rawString].filter(Boolean)[2] || [w.intensity, w.weather].filter(Boolean).join("")).join(" ") || "—";
  }

  async function loadObservations() {
    const results = await Promise.allSettled(C.stations.map((s) => request(`${API}/stations/${s.id}/observations?limit=6`)));
    let anyCurrent = false;
    const rows = results.map((result, index) => {
      const station = C.stations[index];
      if (result.status !== "fulfilled" || !result.value.features?.length) {
        return `<article class="obs-row ${station.primary ? "primary" : ""}"><strong>${station.id}</strong><span class="data-failed">DATA UNAVAILABLE</span><span></span><span></span><span></span><span></span><span></span><span></span></article>`;
      }
      const features = result.value.features;
      const p = features[0].properties;
      const prior = features[1]?.properties || {};
      const obsTime = new Date(p.timestamp);
      const age = dataAge(obsTime);
      if (age.level === "current") anyCurrent = true;
      const t = cToF(p.temperature?.value), pt = cToF(prior.temperature?.value);
      const d = cToF(p.dewpoint?.value), pd = cToF(prior.dewpoint?.value);
      const w = kmhToMph(p.windSpeed?.value), pw = kmhToMph(prior.windSpeed?.value);
      const g = kmhToMph(p.windGust?.value), pg = kmhToMph(prior.windGust?.value);
      const baro = paToInHg(p.barometricPressure?.value), pbaro = paToInHg(prior.barometricPressure?.value);
      return `<article class="obs-row ${station.primary ? "primary" : ""}">
        <strong>${station.id}</strong>
        <span class="obs-cell ${age.level === "current" ? "" : `data-${age.level}`}">${fmtTime(obsTime)}<small>${station.label} · ${age.label} OLD</small></span>
        <span>${safe(round(t))}° / ${safe(round(d))}° ${trend(t, pt, C.trendThresholds.temperatureF)}</span>
        <span>${windCompass(p.windDirection?.value)} ${safe(round(w))} MPH ${trend(w, pw, C.trendThresholds.windMph)}</span>
        <span>${g == null ? "—" : round(g)} ${trend(g, pg, C.trendThresholds.gustMph)}</span>
        <span>${p.visibility?.value == null ? "—" : round(mToMi(p.visibility.value)) + "SM"} / ${ceiling(p.cloudLayers)}</span>
        <span>${safe(one(baro))} ${trend(baro, pbaro, C.trendThresholds.pressureInHg)}</span>
        <span title="${String(p.rawMessage || "").replace(/"/g, "&quot;")}">${presentWeather(p.presentWeather)}</span>
      </article>`;
    });
    $("observation-rows").innerHTML = rows.join("");
    state.observations = anyCurrent ? "current" : results.some((r) => r.status === "fulfilled") ? "stale" : "failed";
    updateSystemState();
  }

  function parseDuration(text) {
    const m = text.match(/P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
    return ((Number(m?.[1] || 0) * 24 + Number(m?.[2] || 0)) * 60 + Number(m?.[3] || 0)) * 60000;
  }

  function gridValueAt(series, time) {
    if (!series?.values) return null;
    const target = time.getTime();
    for (const item of series.values) {
      const [startText, durationText = "PT1H"] = item.validTime.split("/");
      const start = new Date(startText).getTime();
      if (target >= start && target < start + parseDuration(durationText)) return item.value;
    }
    return null;
  }

  async function loadForecast() {
    try {
      const point = await request(`${API}/points/${C.stadium.latitude},${C.stadium.longitude}`);
      const [grid, hourly] = await Promise.all([
        request(point.properties.forecastGridData),
        request(point.properties.forecastHourly)
      ]);
      const p = grid.properties;
      const hourlyPeriods = hourly.properties?.periods || [];
      const hourlyAt = (time) => hourlyPeriods.find((period) => {
        const start = new Date(period.startTime).getTime();
        const end = new Date(period.endTime).getTime();
        return time.getTime() >= start && time.getTime() < end;
      });
      const now = new Date();
      const first = new Date(now); first.setMinutes(0, 0, 0); first.setHours(first.getHours() + 1);
      const hours = Array.from({ length: 8 }, (_, i) => new Date(first.getTime() + i * 3600000));
      const rows = [
        { label: "TEMP °F", key: "temperature", map: cToF },
        { label: "DEWPOINT °F", key: "dewpoint", map: cToF },
        { label: "WIND MPH", key: "windSpeed", map: kmhToMph, wind: true },
        { label: "GUST MPH", key: "windGust", map: kmhToMph },
        { label: "PRECIP %", key: "probabilityOfPrecipitation" },
        { label: "THUNDER %", key: "probabilityOfThunder" },
        { label: "SKY COVER %", key: "skyCover" }
      ];
      const heat = hours.map((h) => cToF(gridValueAt(p.heatIndex, h)));
      const chill = hours.map((h) => cToF(gridValueAt(p.windChill, h)));
      if (heat.some((v) => v != null && v >= C.apparentTemperature.heatIndexAtOrAboveF)) rows.splice(1, 0, { label: "HEAT INDEX °F", values: heat });
      else if (chill.some((v) => v != null && v <= C.apparentTemperature.windChillAtOrBelowF)) rows.splice(1, 0, { label: "WIND CHILL °F", values: chill });
      const header = `<tr><th>ELEMENT</th>${hours.map((h) => `<th>${fmtTime(h)}</th>`).join("")}</tr>`;
      const body = rows.map((row) => {
        const values = row.values || hours.map((h) => {
          let v = gridValueAt(p[row.key], h);
          if (row.map) v = row.map(v);
          if (row.wind) {
            const period = hourlyAt(h);
            const fallbackSpeed = period?.windSpeed ? Number.parseFloat(period.windSpeed) : null;
            const direction = gridValueAt(p.windDirection, h);
            return `${direction == null ? safe(period?.windDirection, "VRB") : windCompass(direction)} ${safe(round(v == null ? fallbackSpeed : v))}`;
          }
          return safe(round(v));
        });
        return `<tr><td>${row.label}</td>${values.map((v) => `<td>${typeof v === "string" ? v : safe(round(v))}</td>`).join("")}</tr>`;
      }).join("");
      $("hourly-table").innerHTML = `<thead>${header}</thead><tbody>${body}</tbody>`;
      const update = p.updateTime ? new Date(p.updateTime) : null;
      $("forecast-meta").textContent = `FIELD CENTER ${C.stadium.latitude.toFixed(5)}, ${C.stadium.longitude.toFixed(5)} · ${update ? "UPDATED " + fmtTime(update) : "SOURCE TIME UNAVAILABLE"} · RETRIEVED ${fmtTime(new Date())}`;
      $("forecast-state").textContent = "NWS DIGITAL FORECAST · CURRENT";
      state.forecast = "current";
    } catch (error) {
      $("hourly-table").innerHTML = `<thead><tr><th>ELEMENT</th><th>DATA UNAVAILABLE</th></tr></thead><tbody><tr><td>STATUS</td><td>FORECAST REQUEST FAILED</td></tr></tbody>`;
      $("forecast-meta").textContent = `LAST ATTEMPT ${fmtTime(new Date())} · ${error.message}`;
      $("forecast-state").textContent = "UPDATE FAILED";
      state.forecast = "failed";
    }
    updateSystemState();
  }

  const alertPriority = ["Tornado Warning", "Severe Thunderstorm Warning", "Flash Flood Warning", "Tornado Watch", "Severe Thunderstorm Watch", "Special Weather Statement"];
  function priority(event) { const i = alertPriority.indexOf(event); return i < 0 ? 99 : i; }
  async function loadAlerts() {
    try {
      const data = await request(`${API}/alerts/active?point=${C.stadium.latitude},${C.stadium.longitude}`);
      const alerts = (data.features || []).sort((a, b) => priority(a.properties.event) - priority(b.properties.event));
      const primary = alerts[0]?.properties;
      const box = $("stadium-alert");
      box.className = "stadium-alert";
      if (!primary) box.innerHTML = '<span class="alert-scope">STADIUM STATUS</span><strong>NO ACTIVE NWS PRODUCTS FOR STADIUM</strong>';
      else {
        const isWarning = primary.event.includes("Warning");
        box.classList.add(isWarning ? "warning" : "caution");
        box.innerHTML = `<span class="alert-scope">STADIUM INCLUDED</span><strong>${primary.event.toUpperCase()}</strong>`;
      }
      $("alert-list").innerHTML = alerts.length ? alerts.map((f) => {
        const a = f.properties;
        return `<article class="alert-item"><strong>${a.event}</strong><p>${a.headline || a.description?.split("\n")[0] || ""}</p><time>EXPIRES ${a.expires ? fmtTime(new Date(a.expires)) : "UNKNOWN"}</time></article>`;
      }).join("") : '<article class="alert-item"><p>No active warnings, watches, advisories or statements include the field-center point.</p></article>';
      $("alerts-meta").textContent = `CHECKED ${fmtTime(new Date())} · ${alerts.length} ACTIVE`;
      $("alerts-state").textContent = alerts.length ? `${alerts.length} ACTIVE` : "FIELD CENTER · CLEAR";
      state.alerts = "current";
    } catch (error) {
      $("stadium-alert").className = "stadium-alert failed";
      $("stadium-alert").innerHTML = '<span class="alert-scope">STADIUM STATUS</span><strong>ALERT STATUS UNAVAILABLE</strong>';
      $("alert-list").innerHTML = '<article class="alert-item"><p>The NWS alert request failed. This is not an all-clear.</p></article>';
      $("alerts-meta").textContent = `LAST ATTEMPT ${fmtTime(new Date())} · ${error.message}`;
      $("alerts-state").textContent = "UPDATE FAILED";
      state.alerts = "failed";
    }
    updateSystemState();
  }

  function afdHeadlines(text) {
    const clean = text.replace(/\r/g, "").split("\n").map((x) => x.trim()).filter(Boolean);
    const keys = ["SYNOPSIS", "SHORT TERM", "LONG TERM", "AVIATION", "MARINE", "BEACHES"];
    const found = [];
    for (const key of keys) {
      const index = clean.findIndex((line) => line.toUpperCase().includes(`.${key}`));
      if (index >= 0) {
        const sentence = clean.slice(index + 1, index + 6).join(" ").split(/(?<=[.!?])\s+/)[0];
        if (sentence) found.push({ key, sentence: sentence.slice(0, 260) });
      }
      if (found.length === 3) break;
    }
    return found.length ? found : [{ key: "DISCUSSION", sentence: clean.slice(0, 8).join(" ").slice(0, 500) }];
  }

  async function loadAfd() {
    try {
      const index = await request(`${API}/products/types/AFD/locations/MFL`);
      const latest = index["@graph"]?.[0];
      if (!latest?.id) throw new Error("No current MFL AFD product");
      const product = await request(`${API}/products/${latest.id}`);
      const lines = afdHeadlines(product.productText || "");
      $("afd-content").innerHTML = lines.map((x) => `<p><span class="afd-key">${x.key}</span>${x.sentence}</p>`).join("");
      $("afd-meta").textContent = `ISSUED ${product.issuanceTime ? fmtTime(new Date(product.issuanceTime)) : "UNKNOWN"} · ORIGINAL FORECASTER WORDING`;
      state.afd = "current";
    } catch (error) {
      $("afd-content").innerHTML = '<p class="data-failed">MFL AFD DATA UNAVAILABLE</p>';
      $("afd-meta").textContent = `LAST ATTEMPT ${fmtTime(new Date())} · ${error.message}`;
      state.afd = "failed";
    }
    updateSystemState();
  }

  async function loadTropics() {
    try {
      let data;
      try {
        const local = await fetch(`data/current-storms.json?checked=${Date.now()}`, { cache: "no-store" });
        if (!local.ok) throw new Error("Local cache unavailable");
        data = await local.json();
      } catch (_) {
        const direct = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", { cache: "no-store" });
        if (!direct.ok) throw new Error(`${direct.status} ${direct.statusText}`);
        data = await direct.json();
      }
      const fetchedAt = data._fetchedAt ? new Date(data._fetchedAt) : null;
      const cacheAgeMinutes = fetchedAt ? Math.floor((Date.now() - fetchedAt.getTime()) / 60000) : null;
      if (!fetchedAt) throw new Error("NHC cache not initialized");
      const storms = (data.activeStorms || []).filter((s) => ["at", "al", "atlantic"].includes(String(s.basin || s.id || "").slice(0, 2).toLowerCase()) || /atlantic/i.test(s.basin || ""));
      if (!storms.length) $("tropical-content").innerHTML = `<p class="tropical-empty">NO ACTIVE ATLANTIC TROPICAL CYCLONES</p>${cacheAgeMinutes > 30 ? '<p class="data-stale">CACHE STALE — VERIFY WITH NHC</p>' : ''}`;
      else $("tropical-content").innerHTML = storms.map((s) => `<article class="storm">
        <strong>${safe(s.classification, "SYSTEM")} ${safe(s.name, safe(s.id))}</strong>
        <span><small>LOCATION</small>${safe(s.latitude)} ${safe(s.longitude)}</span>
        <span><small>MAX WIND</small>${safe(s.intensity)} MPH</span>
        <span><small>MOVEMENT</small>${safe(s.movementDir)} ${safe(s.movementSpeed)} MPH</span>
        <span><small>PRESSURE</small>${safe(s.pressure)} MB</span>
        <span><small>ADVISORY</small>${safe(s.advisoryNumber)}</span>
      </article>`).join("");
      $("tropical-meta").textContent = `NHC CACHE ${cacheAgeMinutes}M OLD · CHECKED ${fmtTime(new Date())}`;
      state.tropics = cacheAgeMinutes > 30 ? "stale" : "current";
    } catch (error) {
      $("tropical-content").innerHTML = '<p class="data-failed">NHC STATUS CACHE UNAVAILABLE · USE NHC LINK</p>';
      $("tropical-meta").textContent = `LAST ATTEMPT ${fmtTime(new Date())} · ${error.message}`;
      state.tropics = "failed";
    }
    updateSystemState();
  }

  function updateSystemState() {
    const critical = [state.observations, state.forecast, state.alerts];
    let overall = "current";
    if (critical.every((x) => x === "failed")) overall = "offline";
    else if (critical.some((x) => x === "failed") || Object.values(state).some((x) => x === "failed")) overall = "degraded";
    else if (critical.some((x) => x === "stale")) overall = "stale";
    else if (Object.values(state).some((x) => x === "loading")) overall = "loading";
    const el = $("system-state");
    el.textContent = overall.toUpperCase(); el.className = `state ${overall}`;
    $("last-refresh").textContent = `LAST CHECK ${fmtTime(new Date(), { second: "2-digit" })}`;
  }

  function updateClock() {
    const now = new Date();
    $("local-date").textContent = fmtDate(now);
    $("local-clock").textContent = fmtTime(now, { second: "2-digit" });
    if (C.game.kickoff) {
      const kickoff = new Date(C.game.kickoff);
      const delta = kickoff.getTime() - now.getTime();
      if (delta > 0) {
        const days = Math.floor(delta / 86400000);
        const hours = Math.floor((delta % 86400000) / 3600000);
        const minutes = Math.floor((delta % 3600000) / 60000);
        $("game-state").textContent = days > 0 ? `T-${days}D ${hours}H` : `T-${hours}H ${minutes}M`;
      } else if (delta > -5 * 3600000) $("game-state").textContent = "IN GAME";
      else $("game-state").textContent = "FINAL";
    }
  }

  function setupStatic() {
    $("game-date").textContent = C.game.date || "GAME DAY";
    $("game-name").textContent = C.game.opponent ? `FAU vs ${C.game.opponent}` : "FAU HOME FOOTBALL";
    $("game-state").textContent = C.game.kickoff ? "CALCULATING" : "NOT SET";
    $("quick-links").innerHTML = C.links.map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join("");
  }

  function start() {
    setupStatic(); updateClock(); setInterval(updateClock, 1000);
    loadObservations(); loadForecast(); loadAlerts(); loadAfd(); loadTropics();
    setInterval(loadObservations, C.refreshMs.observations);
    setInterval(loadForecast, C.refreshMs.forecast);
    setInterval(loadAlerts, C.refreshMs.alerts);
    setInterval(loadAfd, C.refreshMs.afd);
    setInterval(loadTropics, C.refreshMs.tropics);
  }
  start();
})();
