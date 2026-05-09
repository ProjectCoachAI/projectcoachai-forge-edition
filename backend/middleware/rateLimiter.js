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

// Auth limiter — signin, register, password reset
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Registration limiter — stricter to prevent account farming
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: { success: false, error: 'Too many registration attempts. Please try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  message: { success: false, error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Synthesis limiter — prevent credit farming and API cost abuse
const synthesisLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { success: false, error: 'Too many synthesis requests. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Compare limiter — prevent automated scraping
const compareLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { success: false, error: 'Too many compare requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Contact limiter
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: { success: false, error: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, registerLimiter, apiLimiter, synthesisLimiter, compareLimiter, contactLimiter };
