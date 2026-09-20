window.FAU_CONFIG = {
  stadium: {
    name: "Flagler Credit Union Stadium",
    latitude: 26.37528,
    longitude: -80.10028,
    timezone: "America/New_York"
  },
  events: [
    {
      date: "SAT OCT 3 · 6:00 PM",
      label: "FOOTBALL",
      opponent: "TEXAS SOUTHERN",
      kickoff: "2026-10-03T18:00:00-04:00"
    },
    {
      date: "SAT OCT 24 · KICKOFF TBA",
      label: "FOOTBALL",
      opponent: "RICE",
      dateKey: "2026-10-24",
      kickoff: null
    }
  ],
  stations: [
    { id: "KBCT", label: "BOCA RATON", primary: true },
    { id: "KPMP", label: "POMPANO BEACH", primary: false },
    { id: "KFXE", label: "FT LAUD EXEC", primary: false }
  ],
  freshnessMinutes: { current: 60, stale: 90 },
  refreshMs: {
    observations: 60000,
    forecast: 300000,
    alerts: 60000,
    outlooks: 300000,
    afd: 300000,
    tropics: 300000,
    scoreboard: 15000
  },
  lightning: {
    allClearMinutes: 30,
    clearPollSeconds: 120,
    cautionPollSeconds: 60,
    warningPollSeconds: 30
  },
  apparentTemperature: { heatIndexAtOrAboveF: 90, windChillAtOrBelowF: 40 },
  trendThresholds: { temperatureF: 2, dewpointF: 2, windMph: 3, gustMph: 3, pressureInHg: 0.03 },
  links: [
    { label: "GOES GLM", url: "https://www.star.nesdis.noaa.gov/GOES/sector_band.php?sat=G19&sector=se&band=EXTENT3&length=12&src=nav" },
    { label: "MFL", url: "https://www.weather.gov/mfl/" },
    { label: "SATELLITE", url: "https://www.star.nesdis.noaa.gov/GOES/sector.php?sat=G19&sector=se" },
    { label: "VISIBLE", url: "https://www.star.nesdis.noaa.gov/GOES/sector_band.php?sat=G19&sector=se&band=GEOCOLOR&length=12&dim=1" },
    { label: "SPC", url: "https://www.spc.noaa.gov/" },
    { label: "NHC", url: "https://www.nhc.noaa.gov/" },
    { label: "WEATHER.IM", url: "https://weather.im/" },
    { label: "MORE", url: "https://www.weather.gov/" }
  ]
};
