// Wetter & Sonnenzeiten über Open-Meteo (kostenlos, kein API-Key).

const FORECAST = 'https://api.open-meteo.com/v1/forecast';

export async function fetchWeather(lat, lon) {
  const url = `${FORECAST}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`
    + '&current=temperature_2m,precipitation,weather_code'
    + '&daily=sunrise,sunset&timezone=auto&forecast_days=1';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wetter fehlgeschlagen (${res.status})`);
  const d = await res.json();
  return {
    temp: d.current ? d.current.temperature_2m : null,
    precip: d.current ? d.current.precipitation : null,
    code: d.current ? d.current.weather_code : null,
    sunrise: d.daily && d.daily.sunrise ? d.daily.sunrise[0] : null,
    sunset: d.daily && d.daily.sunset ? d.daily.sunset[0] : null,
  };
}

// WMO-Wettercode → Emoji + Kurztext
export function weatherInfo(code) {
  if (code == null) return { icon: '🌡', text: '' };
  if (code === 0) return { icon: '☀️', text: 'klar' };
  if (code <= 2) return { icon: '🌤', text: 'heiter' };
  if (code === 3) return { icon: '☁️', text: 'bewölkt' };
  if (code <= 48) return { icon: '🌫', text: 'Nebel' };
  if (code <= 57) return { icon: '🌦', text: 'Niesel' };
  if (code <= 67) return { icon: '🌧', text: 'Regen' };
  if (code <= 77) return { icon: '❄️', text: 'Schnee' };
  if (code <= 82) return { icon: '🌧', text: 'Schauer' };
  if (code <= 86) return { icon: '🌨', text: 'Schneeschauer' };
  return { icon: '⛈', text: 'Gewitter' };
}
