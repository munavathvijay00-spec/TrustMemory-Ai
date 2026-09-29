// @ts-check
/**
 * Security headers for every response.
 *
 * The Content Security Policy allows only this origin, plus Google Fonts. Inline scripts are
 * still allowed because the console uses inline onclick handlers and a tiny theme script in
 * <head>; every value those templates show is escaped (see test/frontend.test.js). The
 * microphone is allowed for this origin only (the helper's phone screen listens to her).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(req, res, next) {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'microphone=(self), camera=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
  });
  next();
}

module.exports = { securityHeaders, CSP };
