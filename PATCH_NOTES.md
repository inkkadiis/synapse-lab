# Patch Notes

## 2026-04-14 13:52:44 +09:00

### Current Issues

- **Google Login failure on deployed site**
  - Symptom: Google sign-in does not complete on `web.app` / preview domains.
  - Root cause: Firebase/Auth API key restriction blocks requests by referrer (`API_KEY_HTTP_REFERRER_BLOCKED`).
  - Action needed: replace `GEMINI_API_KEY`/web key strategy and update key restriction policy for intended runtime.

- **AI analyze endpoint returns 500**
  - Symptom: `POST /api/analyze` returns `500 Internal Server Error` and frontend shows `{"error":"Failed to analyze paper text"}`.
  - Root cause: deployed backend function reaches Gemini call, but API key is blocked for server-side calls (`referer <empty>`).
  - Action needed: use a server-safe Gemini key (no browser referrer restriction) in deploy secret.
