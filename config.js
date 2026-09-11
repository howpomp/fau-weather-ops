window.FAU_CONFIG = {
  stadium: {
    name: "Flagler Credit Union Stadium",
    latitude: 26.37528,
    longitude: -80.10028,
    timezone: "America/New_York"
  },
  events: [
    {
      date: "FRI SEP 11 · 7:00 PM",
      label: "MEN'S SOCCER",
      opponent: "CHARLOTTE",
      kickoff: "2026-09-11T19:00:00-04:00"
    },
    {
      date: "SAT SEP 12 · 7:30 PM",
      label: "FOOTBALL",
      opponent: "NAVY",
      kickoff: "2026-09-12T19:30:00-04:00"
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
    tropics: 300000
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
    { label: "DESI", url: "https://desi.weather.gov/" },
    { label: "MFL", url: "https://www.weather.gov/mfl/" },
    { label: "SATELLITE", url: "https://www.star.nesdis.noaa.gov/GOES/sector.php?sat=G19&sector=se" },
    { label: "HRRR", url: "https://www.weather.gov/mdl/hrrr" },
    { label: "SPC", url: "https://www.spc.noaa.gov/" },
    { label: "NHC", url: "https://www.nhc.noaa.gov/" },
    { label: "WEATHER.IM", url: "https://weather.im/" },
    { label: "MORE", url: "https://www.weather.gov/" }
  ]
};
