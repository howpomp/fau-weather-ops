# FAU Weather Operations Dashboard

Single-screen game-day weather dashboard for Flagler Credit Union Stadium.

## Run locally

### Windows — easiest method

1. Extract the entire ZIP file.
2. Open the extracted `fau-weather-ops` folder.
3. Double-click `START_DASHBOARD.cmd`.
4. Keep the command window open while using the dashboard.

The dashboard opens at `http://localhost:8765/` using Windows PowerShell. No Python installation is required.

### Other systems

The dashboard uses browser requests to official NOAA/NWS services, so serve the directory rather than opening `index.html` directly:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Configure

Edit `config.js` to set the game, kickoff, quick links, stations, refresh intervals and thresholds.

## GitHub Pages

The project is plain HTML, CSS and JavaScript. It can be published directly from the repository root or from a `/docs` directory without a build step.

## Data sources

- Aviation Weather Center METAR API through the Cloudflare proxy
- NWS digital forecast grid
- NWS Alerts Web Service
- NWS text products API for the MFL Area Forecast Discussion
- National Hurricane Center current-storm JSON feed
- Vaisala Xweather lightning API through the Cloudflare proxy

## Cloudflare Worker

`cloudflare-worker.js` is the source for the `fau-weather-data-proxy` Worker. It provides `/metars`, `/nhc`, `/lightning`, and `/health` routes.

The Worker requires two encrypted secrets and one KV binding:

- Secret `XWEATHER_CLIENT_ID`
- Secret `XWEATHER_CLIENT_SECRET`
- KV namespace binding `FAU_WEATHER_STATE`

Lightning requests are disabled outside the server-side `COVERAGE_WINDOWS`. During coverage, the Worker polls Xweather no more than once per 60 seconds in normal mode and once per 30 seconds after lightning is detected within 15 miles. It maintains a usage counter and stops upstream lightning requests at 14,500 monthly accesses, leaving a reserve below the 15,000-access developer limit.

Each module fails independently. An alert request failure is never presented as an all-clear.
