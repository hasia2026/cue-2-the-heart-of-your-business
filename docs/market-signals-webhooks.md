# Market Signals — provider webhook guide

CUE listens for marketplace chatter via two authenticated webhook endpoints.
Point any social-listening provider (or your GBP sync tool) at them and every
deduped, intent-tagged mention lands in **Signals** in the app.

## 1. Auth

Every call needs one of:

| Caller | Credential | How to send |
|---|---|---|
| Provider webhook | `SIGNALS_INGEST_TOKEN` (set in Vercel env) | Header `x-cue-signals: <token>` **and** an `organizationId` in the body (validated against the `organizations` table) |
| A signed-in CUE user | session cookie | nothing extra — scoped to that user's org |

Note: the token alone is not enough — the same token can't be shared across
orgs without naming which org each call belongs to via `organizationId`.

Rate limit: 60 requests/minute per IP. Providers should batch (arrays are
accepted) instead of one call per mention.

## 2. Social-listening provider → `POST /api/ingest/signals`

Accepted shapes: a single signal object, `{"signals": [...]}`, or
`{"items": [...]}`. Title falls back to `text`/`content`; timestamps accept
unix seconds, unix ms, or ISO strings.

**Single post (Facebook group mention someone asked where to buy):**

```http
POST https://cue.hasiatechnologies.com/api/ingest/signals
x-cue-signals: <YOUR_TOKEN>
Content-Type: application/json

{
  "organizationId": "9f1d2a34-5b6c-4a2b-8b1a-000000000001",
  "id": "fb-post-8842",
  "channel": "FACEBOOK",
  "source": "listening-tool",
  "author": "@MapsNeighbor",
  "title": "Who is the best air conditioning company around here?",
  "text": "Getting quotes next week — who do you all recommend for a full system install?",
  "url": "https://facebook.com/groups/123/posts/8842",
  "timestamp": "2026-10-26T18:02:00Z"
}
```

**Batch (listening-tool convention):**

```json
{
  "organizationId": "9f1d2a34-5b6c-4a2b-8b1a-000000000001",
  "items": [
    {
      "id": "x-991",
      "channel": "X",
      "author": "@HVACHelpMe",
      "title": "AC stopped cooling after the storm — need help fast",
      "text": "Heard clicking and now it's blowing warm.",
      "timestamp": 1798358400
    },
    {
      "id": "ig-42",
      "platform": "INSTAGRAM",
      "title": "Thinking of trading my 2021 Tahoe before summer road trips",
      "text": "Want an estimate on trade-in value this month.",
      "timestamp": 1798359000
    }
  ]
}
```

**Response:**

```json
{ "ok": true, "accepted": 2, "created": 2, "hotAlerts": 1 }
```

`created` counts new rows (replays of an already-seen signal dedupe to 0).
`hotAlerts` counts fresh actionable signals that triggered the owner email +
Web Push whisper.

## 3. Google Business Profile sync → `POST /api/ingest/google`

Accepts `{"reviews": [...]}` or a single review object using Google's own
conventions (`reviewId`, `comment`, `reviewer.displayName`, `starRating`,
`createTime`). `starRating` accepts `FIVE` or `5`.

```http
POST https://cue.hasiatechnologies.com/api/ingest/google
x-cue-signals: <YOUR_TOKEN>
Content-Type: application/json

{
  "organizationId": "9f1d2a34-5b6c-4a2b-8b1a-000000000001",
  "reviews": [
    {
      "reviewId": "AbCdEf123",
      "reviewer": { "displayName": "Dana R." },
      "comment": "Great service, booked my brake inspection same-day.",
      "starRating": "FIVE",
      "createTime": "2026-10-26T09:30:00Z",
      "url": "https://search.google.com/local/review?id=AbCdEf123"
    },
    {
      "reviewId": "GhIjKl456",
      "reviewer": { "displayName": "Mike T." },
      "comment": "Looking to trade in my truck — what's it worth?",
      "starRating": 3,
      "createTime": "2026-10-26T14:10:00Z"
    }
  ]
}
```

Each review lands with channel `GOOGLE`, source `GBP`, and a title like
`GBP review — Dana R. (5★)`.

## 4. What happens on arrival

1. **Deduped** — provider `id`/`reviewId` or a SHA-256 over author/title/body;
   provider retries are silent no-ops.
2. **Intent-tagged** (BUY / SELL / SERVICE): keyword rules first (free,
   instant); anything they miss goes to the AI classifier using the same
   bring-your-own-key chain as the AI Ambassador (org key, then
   `GROQ_API_KEY` / `ANTHROPIC_API_KEY` / `XAI_API_KEY` / `GEMINI_API_KEY`).
   With no key configured, unclassified stays unclassified — never wrong.
3. **Hot-signal alert** — fresh BUY-intent **and** urgent-service (SERVICE)
   signals email the pilot-request inbox
   (`PILOT_REQUEST_EMAIL`) and Web Push-whisper every registered device.
4. **One-click action** — in Signals: → Lead (pipeline), → Insight
   (knowledge), or Dismiss.
