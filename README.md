# Echo

Echo is a local-first personal notes and reflection app built with Expo. The app keeps a local JSON cache on device and syncs notes, check-ins, weekly reviews, reflection preferences, bucket preferences, standing messages, and note deletion tombstones through the Vercel backend into Supabase.

## Current Capabilities

- Capture notes and check-ins locally.
- Schedule a weekly review, receive a local reminder, and revisit or edit past reviews.
- Surface due Echo cards from note scheduling metadata.
- Classify notes and shorten widget text through the backend.
- Sync local snapshots to Supabase.
- Keep database tables protected with RLS while the backend writes through a server-only service role key.

## Environment

Set this in your Expo environment:

```bash
EXPO_PUBLIC_ECHO_API_URL=https://your-backend.example.com
EXPO_PUBLIC_ECHO_API_TOKEN=replace-with-a-long-random-token
```

Set these in `backend/.env` for local development, or add them as Vercel project environment variables when deployed:

```bash
PORT=8787
OPENAI_API_KEY=sk-...
ECHO_OPENAI_MODEL=gpt-5-nano
ECHO_API_TOKEN=replace-with-the-same-long-random-token
SUPABASE_URL=https://ufggqelbtqldxaokdsds.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the Expo app.
`ECHO_API_TOKEN` protects the personal backend from anonymous reads, writes, and
OpenAI usage. The Expo token is embedded in personal builds, so rotate both
values if a build is ever distributed outside your own devices.

## Supabase Schema

The database schema lives in [supabase/schema.sql](/C:/Users/wizdr/Desktop/Code/Echo/supabase/schema.sql). It creates:

- `notes`
- `check_ins`
- `deleted_notes`
- `bucket_preferences`
- `standing_messages`
- `sync_devices`
- `weekly_reviews`
- `weekly_review_preferences`

RLS is enabled on all public tables. The mobile app does not query Supabase directly; the backend uses the service role key.

## Backend Contract

### `POST /api/mobile/classify-note`

Request:

```json
{
  "note": {
    "id": "note-20260429-143245-a8f2",
    "title": "Idea for Supabase-backed notes",
    "body": "The actual note body goes here.",
    "createdAt": "2026-04-29T14:32:45-07:00",
    "updatedAt": "2026-04-29T14:32:45-07:00"
  },
  "buckets": [
    {
      "name": "Research",
      "description": "Ideas and references to revisit.",
      "colorKey": "sky"
    }
  ]
}
```

Response:

```json
{
  "title": "Supabase Note Sync",
  "bucket": "Research",
  "confidence": 0.86,
  "method": "ai",
  "model": "gpt-5-nano"
}
```

### `POST /api/mobile/sync`

Request:

```json
{
  "deviceId": "device-...",
  "snapshot": {
    "notes": [],
    "checkIns": [],
    "deletedNotes": [],
    "bucketPreferences": {
      "customs": []
    },
    "standingMessages": [],
    "weeklyReviews": [],
    "weeklyReviewPreferences": {
      "enabled": false,
      "weekday": 1,
      "hour": 18,
      "minute": 0,
      "startsAt": null,
      "updatedAt": null
    }
  }
}
```

### `GET /api/mobile/status`

Requires `Authorization: Bearer <ECHO_API_TOKEN>` and verifies that the backend
can reach Supabase without returning note contents.

Response:

```json
{
  "notes": [],
  "checkIns": [],
  "deletedNotes": [],
  "bucketPreferences": {
    "customs": []
  },
  "standingMessages": [],
  "weeklyReviews": [],
  "weeklyReviewPreferences": {
    "enabled": false,
    "weekday": 1,
    "hour": 18,
    "minute": 0,
    "startsAt": null,
    "updatedAt": null
  },
  "syncedAt": "2026-04-30T19:45:00-07:00",
  "summary": {
    "pushedNotes": 14,
    "pushedCheckIns": 3,
    "pulledNotes": 2,
    "pulledCheckIns": 0,
    "pushedWeeklyReviews": 4,
    "pulledWeeklyReviews": 4,
    "storedRows": 20
  }
}
```

## Vercel Backend

The backend is structured as Vercel Functions under [backend/api](/C:/Users/wizdr/Desktop/Code/Echo/backend/api) with shared logic in [backend/src](/C:/Users/wizdr/Desktop/Code/Echo/backend/src).

Important files:

- [backend/vercel.json](/C:/Users/wizdr/Desktop/Code/Echo/backend/vercel.json)
- [backend/api/health.ts](/C:/Users/wizdr/Desktop/Code/Echo/backend/api/health.ts)
- [backend/api/mobile/classify-note.ts](/C:/Users/wizdr/Desktop/Code/Echo/backend/api/mobile/classify-note.ts)
- [backend/api/mobile/sync.ts](/C:/Users/wizdr/Desktop/Code/Echo/backend/api/mobile/sync.ts)
- [backend/src/sync.ts](/C:/Users/wizdr/Desktop/Code/Echo/backend/src/sync.ts)
- [backend/src/supabase.ts](/C:/Users/wizdr/Desktop/Code/Echo/backend/src/supabase.ts)

Local backend development:

```bash
npm run backend:dev
```

To deploy on Vercel:

1. Create a Vercel project rooted at `backend/`.
2. Set `OPENAI_API_KEY`, `ECHO_OPENAI_MODEL`, `ECHO_API_TOKEN`, `SUPABASE_URL`,
   and `SUPABASE_SERVICE_ROLE_KEY`.
3. Deploy.
4. Point `EXPO_PUBLIC_ECHO_API_URL` at the deployed Vercel URL.

## Development

```bash
npm install
cd backend && npm install
npm run dev
npx expo start
```

Validation:

```bash
npx tsc --noEmit
npm run lint
npm run backend:typecheck
npm run backend:build
```
