// forge-realtime-fetchers.js
const axios = require('axios');

// ── EXCHANGE RATES ────────────────────────────────────────────
// Source: Frankfurter (ECB data) — completely free, no API key
// Backup: ExchangeRate-API — 1,500 free calls/month
async function fetchExchangeRates(question) {
  try {
    // Extract currency codes from question
    const currencies = extractCurrencyCodes(question);
    const base = currencies.base || 'CHF';
    const targets = currencies.targets.join(',') || 'EUR,USD,GBP,INR,JPY,AUD,CAD';
    const res = await axios.get(
      `https://api.frankfurter.app/latest?from=${base}&to=${targets}`,
      { timeout: 5000 }
    );
    const rates = res.data.rates;
    const timestamp = new Date().toISOString();
    let context = `LIVE EXCHANGE RATES (Source: European Central Bank, ${timestamp}):\n`;
    context += `Base currency: ${base}\n`;
    for (const [currency, rate] of Object.entries(rates)) {
      context += `1 ${base} = ${rate.toFixed(4)} ${currency}\n`;
    }
    context += `\nIMPORTANT: Use these live rates in your response. `;
    context += `Do not use rates from your training data — they are outdated.`;
    return context;
  } catch (err) {
    // Fallback to backup API
    try {
      const res = await axios.get(
        `https://open.er-api.com/v6/latest/CHF`,
        { timeout: 5000 }
      );
      const rates = res.data.rates;
      const timestamp = new Date().toISOString();
      let context = `LIVE EXCHANGE RATES (Source: ExchangeRate-API, ${timestamp}):\n`;
      context += `1 CHF = ${rates.INR?.toFixed(2)} INR\n`;
      context += `1 CHF = ${rates.EUR?.toFixed(4)} EUR\n`;
      context += `1 CHF = ${rates.USD?.toFixed(4)} USD\n`;
      context += `1 CHF = ${rates.GBP?.toFixed(4)} GBP\n`;
      context += `\nIMPORTANT: Use these live rates in your response.`;
      return context;
    } catch (fallbackErr) {
      return `NOTE: Live exchange rate fetch failed. Please caveat any ` +
             `exchange rates in your response as approximate/outdated ` +
             `and recommend the user verify with xe.com or Google Finance.`;
    }
  }
}

function extractCurrencyCodes(question) {
  const CODES = ['CHF', 'USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD',
                 'CAD', 'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'NZD',
                 'CNY', 'BRL', 'MXN', 'ZAR', 'TRY', 'KRW'];
  const found = CODES.filter(code =>
    question.toUpperCase().includes(code)
  );
  return {
    base: found[0] || 'CHF',
    targets: found.length > 1 ? found.slice(1) : ['EUR', 'USD', 'GBP', 'INR']
  };
}

// ── CRYPTO PRICES ─────────────────────────────────────────────
// Source: CoinGecko — free, no API key for basic calls
async function fetchCryptoData(question) {
  try {
    const CRYPTO_IDS = {
      'BTC': 'bitcoin', 'ETH': 'ethereum', 'USDT': 'tether',
      'BNB': 'binancecoin', 'SOL': 'solana', 'XRP': 'ripple',
      'ADA': 'cardano', 'DOT': 'polkadot', 'DOGE': 'dogecoin',
    };
    const q = question.toUpperCase();
    const ids = Object.entries(CRYPTO_IDS)
      .filter(([code]) => q.includes(code))
      .map(([, id]) => id);
    const coinsToFetch = ids.length ? ids.join(',') : 'bitcoin,ethereum';
    const res = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price` +
      `?ids=${coinsToFetch}&vs_currencies=usd,chf,eur&include_24hr_change=true`,
      { timeout: 5000 }
    );
    const timestamp = new Date().toISOString();
    let context = `LIVE CRYPTO PRICES (Source: CoinGecko, ${timestamp}):\n`;
    for (const [coin, data] of Object.entries(res.data)) {
      const change = data.usd_24h_change?.toFixed(2);
      const direction = change >= 0 ? '▲' : '▼';
      context += `${coin.toUpperCase()}: $${data.usd?.toLocaleString()} USD`;
      context += ` | CHF ${data.chf?.toLocaleString()}`;
      context += ` | ${direction} ${Math.abs(change)}% (24h)\n`;
    }
    context += `\nIMPORTANT: Use these live prices. Do not use prices from training data.`;
    return context;
  } catch (err) {
    return `NOTE: Live crypto price fetch failed. Caveat any prices as ` +
           `approximate and recommend the user verify with CoinGecko or CoinMarketCap.`;
  }
}

// ── NEWS HEADLINES ────────────────────────────────────────────
// Source: NewsAPI — 100 free calls/day (developer plan)
// Backup: GNews — 100 free calls/day
async function fetchNewsHeadlines(question) {
  try {
    const NEWS_API_KEY = process.env.NEWS_API_KEY;
    if (!NEWS_API_KEY) throw new Error('No NewsAPI key');
    // Extract topic from question
    const topic = extractNewsTopic(question);
    const res = await axios.get(
      `https://newsapi.org/v2/top-headlines?q=${encodeURIComponent(topic)}` +
      `&language=en&pageSize=5&apiKey=${NEWS_API_KEY}`,
      { timeout: 5000 }
    );
    const articles = res.data.articles;
    if (!articles.length) return null;
    const timestamp = new Date().toISOString();
    let context = `LIVE NEWS HEADLINES (Source: NewsAPI, ${timestamp}):\n`;
    articles.slice(0, 5).forEach((a, i) => {
      const published = new Date(a.publishedAt).toLocaleDateString('en-GB');
      context += `${i + 1}. [${published}] ${a.title} — ${a.source.name}\n`;
    });
    context += `\nUse these current headlines to inform your response about recent events.`;
    return context;
  } catch (err) {
    return null; // silent fail — news is supplementary
  }
}

function extractNewsTopic(question) {
  return question
    .replace(/what('s| is| are)/gi, '')
    .replace(/tell me about|latest|news on|update on/gi, '')
    .trim()
    .slice(0, 100);
}

// ── WEATHER ───────────────────────────────────────────────────
// Source: Open-Meteo — completely free, no API key
async function fetchWeather(question) {
  try {
    const location = extractLocation(question) || 'Zurich';
    const geoRes = await axios.get(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`,
      { timeout: 5000 }
    );
    if (!geoRes.data.results?.length) return null;
    const { latitude, longitude, name, country } = geoRes.data.results[0];
    const weatherRes = await axios.get(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=3` +
      `&timezone=auto`,
      { timeout: 5000 }
    );
    const current = weatherRes.data.current;
    const daily = weatherRes.data.daily;
    const timestamp = new Date().toISOString();
    let context = `LIVE WEATHER (Source: Open-Meteo, ${timestamp}):\n`;
    context += `Location: ${name}, ${country}\n`;
    context += `Current temperature: ${current.temperature_2m}°C\n`;
    context += `Humidity: ${current.relative_humidity_2m}%\n`;
    context += `Wind: ${current.wind_speed_10m} km/h\n`;
    context += `Next 3 days: `;
    daily.time.slice(0, 3).forEach((date, i) => {
      context += `${date}: ${daily.temperature_2m_min[i]}–${daily.temperature_2m_max[i]}°C`;
      if (daily.precipitation_sum[i] > 0) context += ` (${daily.precipitation_sum[i]}mm rain)`;
      context += ' | ';
    });
    context += `\nUse this live weather data in your response.`;
    return context;
  } catch (err) {
    return null;
  }
}

function extractLocation(question) {
  const CITIES = [
    'Zurich', 'Zürich', 'Geneva', 'Genève', 'Bern', 'Basel', 'Lausanne',
    'London', 'Paris', 'Berlin', 'New York', 'Tokyo', 'Mumbai', 'Dubai',
    'Singapore', 'Sydney', 'Toronto', 'Amsterdam', 'Vienna', 'Rome'
  ];
  return CITIES.find(city =>
    question.toLowerCase().includes(city.toLowerCase())
  ) || null;
}

// ── STOCK PRICES ──────────────────────────────────────────────
// Source: Alpha Vantage — 25 free calls/day
async function fetchStockData(question) {
  try {
    const ALPHA_KEY = process.env.ALPHA_VANTAGE_KEY;
    if (!ALPHA_KEY) return null;
    const ticker = extractTicker(question);
    if (!ticker) return null;
    const res = await axios.get(
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE` +
      `&symbol=${ticker}&apikey=${ALPHA_KEY}`,
      { timeout: 5000 }
    );
    const quote = res.data['Global Quote'];
    if (!quote || !quote['05. price']) return null;
    const timestamp = new Date().toISOString();
    const price = parseFloat(quote['05. price']).toFixed(2);
    const change = parseFloat(quote['09. change']).toFixed(2);
    const changePct = parseFloat(quote['10. change percent']).toFixed(2);
    const direction = change >= 0 ? '▲' : '▼';
    let context = `LIVE STOCK DATA (Source: Alpha Vantage, ${timestamp}):\n`;
    context += `${ticker}: $${price} USD ${direction} ${Math.abs(change)} (${Math.abs(changePct)}%)\n`;
    context += `Previous close: $${parseFloat(quote['08. previous close']).toFixed(2)}\n`;
    context += `\nIMPORTANT: Use this live price. Do not use prices from training data.`;
    return context;
  } catch (err) {
    return null;
  }
}

function extractTicker(question) {
  const COMMON = {
    'apple': 'AAPL', 'google': 'GOOGL', 'microsoft': 'MSFT',
    'tesla': 'TSLA', 'nvidia': 'NVDA', 'amazon': 'AMZN',
    'meta': 'META', 'netflix': 'NFLX'
  };
  const q = question.toLowerCase();
  for (const [name, ticker] of Object.entries(COMMON)) {
    if (q.includes(name)) return ticker;
  }
  const match = question.match(/\b[A-Z]{2,5}\b/);
  return match ? match[0] : null;
}

// ── SPORTS ────────────────────────────────────────────────────
async function fetchSportsData(question) {
  return null; // Placeholder — wire to sports API when key available
}

module.exports = {
  fetchExchangeRates,
  fetchCryptoData,
  fetchNewsHeadlines,
  fetchWeather,
  fetchStockData,
  fetchSportsData,
};
