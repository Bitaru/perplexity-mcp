# Troubleshooting

- `SETUP_REQUIRED`: Set a valid `OWNER_EMAIL`.
- Access denial: Protect the whole hostname and make sure that the signed-in identity exactly matches `OWNER_EMAIL`.
- `PERPLEXITY_AUTH_REQUIRED`: The stored provider session is absent or expired. Open the protected `/admin` page and connect Perplexity again.
- Challenge, entitlement, rate-limit, timeout, and protocol errors: Treat these as separate provider outcomes. Do not bypass account protection or repeat OTP requests.
- `STATE_UNAVAILABLE`: The Durable Object state could not be read or validated. Check Cloudflare status and Worker logs. Reconnect through `/admin` after service is restored.

Inspect sanitized stage and outcome logs only. Do not include credentials, cookies, OTPs, or provider responses in reports. Local diagnosis cannot confirm live Access or provider behavior.
