
"use strict";

const WEATHER_API = "https://api.open-meteo.com/v1/forecast";
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";
const REVERSE_GEO_API =
  "https://api.bigdatacloud.net/data/reverse-geocode-client";

const DEFAULT_CITY = {
  name: "Bengaluru",
  country: "India",
  latitude: 12.9716,
  longitude: 77.5946
};

const $ = (id) => document.getElementById(id);

let currentCity = { ...DEFAULT_CITY };
let weatherData = null;
let useFahrenheit = false;
let temperatureChart = null;
let requestId = 0;
let searchId = 0;
let locationId = 0;

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
  // Check that all required HTML elements exist before using them.
  const requiredIds = [
    "searchForm", "cityInput", "searchBtn", "unitToggle",
    "refreshBtn", "locationBtn", "statusMessage",
    "currentHeading", "currentDate", "weatherDescription",
    "weatherIcon", "currentTemp", "feelsLike", "highLow",
    "sunrise", "sunset", "humidity", "windSpeed",
    "precipitation", "uvIndex", "uvLabel",
    "hourlyForecast", "dailyForecast", "temperatureChart",
    "chartError"
  ];

  const missing = requiredIds.filter((id) => !$(id));

  if (missing.length > 0) {
    console.error("SkyCast HTML elements are missing:", missing);
    setStatus(
      "Some dashboard elements are missing. Replace index.html with the supplied version.",
      true
    );
    return;
  }

  $("searchForm").addEventListener("submit", searchCity);
  $("unitToggle").addEventListener("click", toggleTemperatureUnit);
  $("refreshBtn").addEventListener("click", refreshWeather);
  $("locationBtn").addEventListener("click", useMyLocation);

  loadWeather(DEFAULT_CITY);
}

function setStatus(message, isError = false) {
  const element = $("statusMessage");
  if (!element) return;

  element.textContent = message;
  element.classList.toggle("error", isError);
}

function setBusy(busy) {
  $("searchBtn").disabled = busy;
  $("refreshBtn").disabled = busy;
  $("locationBtn").disabled = busy;
  $("searchBtn").textContent = busy ? "Loading..." : "Search";
}

async function fetchJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.reason || "The API returned an error.");
  }

  return data;
}

function buildWeatherURL(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: "auto",
    forecast_days: "7",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm",
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "is_day",
      "precipitation",
      "weather_code",
      "wind_speed_10m"
    ].join(","),
    hourly: [
      "temperature_2m",
      "precipitation_probability",
      "weather_code",
      "is_day"
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "sunrise",
      "sunset",
      "uv_index_max",
      "precipitation_probability_max"
    ].join(",")
  });

  return `${WEATHER_API}?${params.toString()}`;
}

function validateWeather(data) {
  if (
    !data?.current ||
    !data?.hourly ||
    !data?.daily ||
    !Array.isArray(data.hourly.time) ||
    !Array.isArray(data.hourly.temperature_2m) ||
    !Array.isArray(data.hourly.weather_code) ||
    !Array.isArray(data.daily.time) ||
    !Array.isArray(data.daily.temperature_2m_max) ||
    !Array.isArray(data.daily.temperature_2m_min) ||
    data.hourly.time.length === 0 ||
    data.daily.time.length === 0
  ) {
    throw new Error("The weather API returned incomplete data.");
  }
}

async function loadWeather(city) {
  const thisRequest = ++requestId;

  setBusy(true);
  setStatus(`Loading weather for ${city.name}...`);

  try {
    const data = await fetchJSON(
      buildWeatherURL(city.latitude, city.longitude)
    );

    if (thisRequest !== requestId) return;

    validateWeather(data);

    currentCity = city;
    weatherData = data;

    renderAll();

    setStatus(`Weather updated for ${city.name}, ${city.country}.`);
  } catch (error) {
    if (thisRequest !== requestId) return;

    console.error("Weather error:", error);
    setStatus(
      `${error.message} Check your internet connection and try again.`,
      true
    );
  } finally {
    if (thisRequest === requestId) setBusy(false);
  }
}

async function searchCity(event) {
  event.preventDefault();

  const query = $("cityInput").value.trim();

  if (!query) {
    setStatus("Please enter a city name.", true);
    return;
  }

  const thisSearch = ++searchId;
  ++locationId;

  setBusy(true);
  setStatus(`Searching for ${query}...`);

  try {
    const params = new URLSearchParams({
      name: query,
      count: "10",
      language: "en",
      format: "json"
    });

    const data = await fetchJSON(`${GEO_API}?${params.toString()}`);

    if (thisSearch !== searchId) return;

    const results = (data.results || []).filter(
      (place) =>
        place.country_code === "IN" &&
        Number.isFinite(Number(place.latitude)) &&
        Number.isFinite(Number(place.longitude))
    );

    if (!results.length) {
      setStatus("No matching Indian city found. Check the spelling.", true);
      return;
    }

    const selected =
      results.find(
        (place) => place.name.toLowerCase() === query.toLowerCase()
      ) || results[0];

    $("cityInput").value = "";

    await loadWeather({
      name: selected.name,
      country: selected.country || "India",
      latitude: Number(selected.latitude),
      longitude: Number(selected.longitude)
    });
  } catch (error) {
    if (thisSearch !== searchId) return;

    console.error("Search error:", error);
    setStatus("City search failed. Check your internet connection.", true);
  } finally {
    if (thisSearch === searchId) setBusy(false);
  }
}

function refreshWeather() {
  ++searchId;
  ++locationId;
  loadWeather(currentCity);
}

function toggleTemperatureUnit() {
  useFahrenheit = !useFahrenheit;
  $("unitToggle").textContent = useFahrenheit ? "°F / °C" : "°C / °F";

  if (weatherData) renderAll();
}

function validNumber(value) {
  return value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value));
}

function displayTemperature(value) {
  if (!validNumber(value)) return null;

  const celsius = Number(value);
  return useFahrenheit ? celsius * 9 / 5 + 32 : celsius;
}

function temperatureText(value) {
  const converted = displayTemperature(value);

  if (converted === null) return "--°";

  return `${Math.round(converted)}°${useFahrenheit ? "F" : "C"}`;
}

function renderAll() {
  renderCurrent();
  renderHourly();
  renderDaily();
  renderChart();
}

function renderCurrent() {
  const current = weatherData.current;
  const daily = weatherData.daily;

  $("currentHeading").textContent =
    `${currentCity.name}, ${currentCity.country}`;

  $("currentDate").textContent = formatDateTime(current.time);
  $("weatherDescription").textContent =
    weatherDescription(current.weather_code);

  // The returned icon contains HTML character entities.
  $("weatherIcon").innerHTML =
    weatherIcon(current.weather_code, current.is_day);

  $("currentTemp").textContent = temperatureText(current.temperature_2m);
  $("feelsLike").textContent = temperatureText(current.apparent_temperature);

  $("highLow").textContent =
    `${temperatureText(daily.temperature_2m_max[0])} / ` +
    `${temperatureText(daily.temperature_2m_min[0])}`;

  $("humidity").textContent =
    validNumber(current.relative_humidity_2m)
      ? `${current.relative_humidity_2m}%`
      : "--%";

  $("windSpeed").textContent = validNumber(current.wind_speed_10m)
    ? `${Number(current.wind_speed_10m).toFixed(1)} km/h`
    : "-- km/h";

  $("precipitation").textContent = validNumber(current.precipitation)
    ? `${Number(current.precipitation).toFixed(1)} mm`
    : "-- mm";

  $("sunrise").textContent = formatClock(daily.sunrise?.[0]);
  $("sunset").textContent = formatClock(daily.sunset?.[0]);

  const uv = daily.uv_index_max?.[0];

  if (!validNumber(uv)) {
    $("uvIndex").textContent = "--";
    $("uvLabel").textContent = "Data unavailable";
  } else {
    const value = Number(uv);
    $("uvIndex").textContent = value.toFixed(1);

    if (value < 3) $("uvLabel").textContent = "Low exposure";
    else if (value < 6) $("uvLabel").textContent = "Moderate exposure";
    else if (value < 8) $("uvLabel").textContent = "High exposure";
    else if (value < 11) $("uvLabel").textContent = "Very high exposure";
    else $("uvLabel").textContent = "Extreme exposure";
  }
}

function renderHourly() {
  const hourly = weatherData.hourly;
  const now = weatherData.current.time;

  let start = hourly.time.findIndex((time) => time >= now);
  if (start < 0) start = 0;

  const end = Math.min(start + 24, hourly.time.length);
  const items = [];

  for (let i = start; i < end; i++) {
    items.push(`
      <article class="hourly-item">
        <span class="hourly-time">${escapeHTML(formatHour(hourly.time[i]))}</span>
        <span class="hourly-icon" aria-hidden="true">${weatherIcon(
          hourly.weather_code[i], hourly.is_day?.[i]
        )}</span>
        <strong class="hourly-temp">${temperatureText(
          hourly.temperature_2m[i]
        )}</strong>
        <span class="hourly-condition">${escapeHTML(
          weatherDescription(hourly.weather_code[i])
        )}</span>
      </article>
    `);
  }

  $("hourlyForecast").innerHTML = items.length
    ? items.join("")
    : '<p class="muted">Hourly forecast unavailable.</p>';
}

function renderDaily() {
  const daily = weatherData.daily;
  const items = [];

  for (let i = 0; i < daily.time.length; i++) {
    items.push(`
      <article class="daily-item">
        <span class="daily-day">${escapeHTML(formatDay(daily.time[i], i))}</span>
        <span class="daily-icon" aria-hidden="true">${weatherIcon(
          daily.weather_code[i], 1
        )}</span>
        <span class="daily-description">${escapeHTML(
          weatherDescription(daily.weather_code[i])
        )}</span>
        <span class="daily-temps">
          <strong>${temperatureText(daily.temperature_2m_max[i])}</strong>
          <span>${temperatureText(daily.temperature_2m_min[i])}</span>
        </span>
      </article>
    `);
  }

  $("dailyForecast").innerHTML = items.length
    ? items.join("")
    : '<p class="muted">Daily forecast unavailable.</p>';
}

function renderChart() {
  const canvas = $("temperatureChart");
  const error = $("chartError");

  if (typeof Chart === "undefined") {
    error.hidden = false;
    error.textContent =
      "Chart.js did not load. Check your internet connection and refresh.";
    console.error("Chart.js is unavailable.");
    return;
  }

  const hourly = weatherData.hourly;
  const now = weatherData.current.time;

  let start = hourly.time.findIndex((time) => time >= now);
  if (start < 0) start = 0;

  const end = Math.min(start + 24, hourly.time.length);
  const labels = hourly.time.slice(start, end).map(formatHour);

  const values = hourly.temperature_2m.slice(start, end).map((value) => {
    const converted = displayTemperature(value);
    return converted === null ? null : Number(converted.toFixed(1));
  });

  try {
    if (temperatureChart) {
      temperatureChart.destroy();
      temperatureChart = null;
    }

    if (!labels.length) {
      error.hidden = false;
      error.textContent = "Temperature chart data is unavailable.";
      return;
    }

    error.hidden = true;

    temperatureChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: `Temperature (°${useFahrenheit ? "F" : "C"})`,
          data: values,
          borderColor: "#83b8ff",
          backgroundColor: "rgba(131,184,255,0.13)",
          borderWidth: 3,
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          spanGaps: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { labels: { color: "#dce6f5" } }
        },
        scales: {
          x: {
            ticks: { color: "#a4b1c7", maxTicksLimit: 8 },
            grid: { color: "rgba(255,255,255,0.06)" }
          },
          y: {
            ticks: {
              color: "#a4b1c7",
              callback: (value) => `${value}°`
            },
            grid: { color: "rgba(255,255,255,0.08)" }
          }
        }
      }
    });
  } catch (errorObject) {
    console.error("Chart error:", errorObject);
    error.hidden = false;
    error.textContent = "The chart could not be displayed.";
  }
}

// HTML character entities, not images or literal emoji.
function weatherIcon(code, isDay = 1) {
  const icons = {
    0: isDay ? "&#9728;" : "&#9790;",
    1: isDay ? "&#127774;" : "&#9790;",
    2: "&#9925;",
    3: "&#9729;",
    45: "&#127787;",
    48: "&#127787;",
    51: "&#127783;",
    53: "&#127783;",
    55: "&#9730;",
    56: "&#9730;",
    57: "&#9730;",
    61: "&#9730;",
    63: "&#9730;",
    65: "&#9730;",
    66: "&#9730;",
    67: "&#9730;",
    71: "&#10052;",
    73: "&#10052;",
    75: "&#10052;",
    77: "&#10052;",
    80: "&#127783;",
    81: "&#9730;",
    82: "&#9928;",
    85: "&#10052;",
    86: "&#10052;",
    95: "&#9928;",
    96: "&#9928;",
    99: "&#9928;"
  };

  return icons[Number(code)] || "&#127777;";
}

function weatherDescription(code) {
  const descriptions = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snowfall",
    73: "Moderate snowfall",
    75: "Heavy snowfall",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with hail",
    99: "Severe thunderstorm with hail"
  };

  return descriptions[Number(code)] || "Weather unavailable";
}

function formatHour(value) {
  if (!value || !value.includes("T")) return "--:--";

  const [hourText, minuteText = "00"] = value.split("T")[1].split(":");
  const hour = Number(hourText);

  if (!Number.isFinite(hour)) return "--:--";

  return `${hour % 12 || 12}:${minuteText} ${hour >= 12 ? "PM" : "AM"}`;
}

function formatClock(value) {
  return formatHour(value);
}

function formatDateTime(value) {
  if (!value) return "Date unavailable";

  const [year, month, day] = value.split("T")[0].split("-").map(Number);
  if (!year || !month || !day) return "Date unavailable";

  const date = new Date(year, month - 1, day);
  const dateText = date.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });

  return `${dateText} • ${formatClock(value)}`;
}

function formatDay(value, index) {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function useMyLocation() {
  if (!navigator.geolocation) {
    setStatus("Your browser does not support location services.", true);
    return;
  }

  const thisLocation = ++locationId;
  ++searchId;

  setBusy(true);
  setStatus("Getting your location...");

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      if (thisLocation !== locationId) return;

      try {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        const params = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          language: "en",
          format: "json"
        });

        const result = await fetchJSON(
          `${REVERSE_GEO_API}?${params.toString()}`
        );

        if (thisLocation !== locationId) return;

        if (result.countryCode !== "IN") {
          setStatus("This dashboard currently supports India only.", true);
          return;
        }

        await loadWeather({
          name: result.city || result.locality ||
            result.principalSubdivision || "Your location",
          country: "India",
          latitude,
          longitude
        });
      } catch (error) {
        if (thisLocation !== locationId) return;

        console.error("Location error:", error);
        setStatus(
          "Could not identify your location. Search for a city instead.",
          true
        );
      } finally {
        if (thisLocation === locationId) setBusy(false);
      }
    },
    (error) => {
      if (thisLocation !== locationId) return;

      const messages = {
        1: "Location permission denied. Allow access or search for a city.",
        2: "Location could not be determined. Try again.",
        3: "Location request timed out. Try again."
      };

      setStatus(messages[error.code] || "Unable to access your location.", true);
      setBusy(false);
    },
    {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 300000
    }
  );
}
