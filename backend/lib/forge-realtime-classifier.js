// forge-realtime-classifier.js
const REALTIME_SIGNALS = {
  exchange_rates: {
    keywords: [
      'exchange rate', 'currency', 'convert', 'CHF', 'USD', 'EUR',
      'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'forex', 'fx rate',
      'how much is', 'worth in', 'to dollars', 'to euros', 'to francs',
      'to rupees', 'to pounds'
    ],
    fetcher: 'fetchExchangeRates',
    ttl: 3600,
  },
  stock_prices: {
    keywords: [
      'stock price', 'share price', 'market cap', 'trading at',
      'AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'SMI', 'DAX',
      'S&P', 'Nasdaq', 'FTSE', 'stock market', 'equity'
    ],
    fetcher: 'fetchStockData',
    ttl: 300,
  },
  crypto: {
    keywords: [
      'bitcoin', 'ethereum', 'crypto', 'BTC', 'ETH', 'USDT',
      'cryptocurrency', 'coin price', 'crypto price', 'blockchain price'
    ],
    fetcher: 'fetchCryptoData',
    ttl: 60,
  },
  news_events: {
    keywords: [
      'latest news', 'breaking', 'today', 'this week', 'right now',
      'current situation', 'recent', 'just happened', 'update on',
      'what happened', 'announcement', 'election', 'war', 'crisis'
    ],
    fetcher: 'fetchNewsHeadlines',
    ttl: 900,
  },
  weather: {
    keywords: [
      'weather', 'temperature', 'forecast', 'rain', 'snow',
      'sunny', 'cloudy', 'humidity', 'wind speed', 'celsius', 'fahrenheit'
    ],
    fetcher: 'fetchWeather',
    ttl: 1800,
  },
  sports: {
    keywords: [
      'score', 'match result', 'who won', 'league table', 'standings',
      'FIFA', 'UEFA', 'Champions League', 'Premier League', 'NBA',
      'NFL', 'cricket score', 'tennis result'
    ],
    fetcher: 'fetchSportsData',
    ttl: 300,
  },
};

function classifyQuery(question) {
  const q = question.toLowerCase();
  const detected = [];
  for (const [type, config] of Object.entries(REALTIME_SIGNALS)) {
    if (config.keywords.some(kw => q.includes(kw.toLowerCase()))) {
      detected.push({ type, ...config });
    }
  }
  return detected; // empty = no real-time data needed
}

module.exports = { classifyQuery };
