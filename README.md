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

- NWS API station observations
- NWS digital forecast grid
- NWS Alerts Web Service
- NWS text products API for the MFL Area Forecast Discussion
- National Hurricane Center current-storm JSON feed

Each module fails independently. An alert request failure is never presented as an all-clear.
