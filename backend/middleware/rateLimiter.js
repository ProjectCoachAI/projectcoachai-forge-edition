'use strict';

// Production rate limiting — graceful fallback if package unavailable
let rateLimit;
try {
  rateLimit = require('express-rate-limit');
} catch(_) {
  // Fallback: pass-through middleware
  rateLimit = (opts) => (req, res, next) => next();
  console.warn('[RateLimit] express-rate-limit not available — using pass-through');
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { success: false, error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, apiLimiter, contactLimiter };
