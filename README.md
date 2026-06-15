# Echo

Echo is a local-first personal notes and reflection app built with Expo. The app keeps a local JSON cache on device and syncs notes, check-ins, bucket preferences, standing messages, and note deletion tombstones through the Vercel backend into Supabase.

## Current Capabilities

- Capture notes and check-ins locally.
- Surface due Echo cards from note scheduling metadata.
- Classify notes and shorten widget text through the backend.
- Sync local snapshots to Supabase.
- Keep database tables protected with RLS while the backend writes through a server-only service role key.

## Environment

Set this in your Expo environment:

```bash
EXPO_PUBLIC_ECHO_API_URL=https://your-backend.example.com
```

Set these in `backend/.env` for local development, or add them as Vercel project environment variables when deployed:

```bash
PORT=8787
OPENAI_API_KEY=sk-...
ECHO_OPENAI_MODEL=gpt-5.4-nano
SUPABASE_URL=https://ufggqelbtqldxaokdsds.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` to the Expo app.

## Supabase Schema

The database schema lives in [supabase/schema.sql](/C:/Users/wizdr/Desktop/Code/Echo/supabase/schema.sql). It creates:

- `notes`
- `check_ins`
- `deleted_notes`
- `bucket_preferences`
- `standing_messages`
- `sync_devices`

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
  }
}
```

Response:

```json
{
  "title": "Supabase Note Sync",
  "bucket": "Systems",
  "confidence": 0.86,
  "method": "ai",
  "model": "gpt-5.4-nano"
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
      "builtins": {},
      "customs": []
    },
    "standingMessages": []
  }
}
```

Response:

```json
{
  "notes": [],
  "checkIns": [],
  "deletedNotes": [],
  "bucketPreferences": {
    "builtins": {},
    "customs": []
  },
  "standingMessages": [],
  "syncedAt": "2026-04-30T19:45:00-07:00",
  "summary": {
    "pushedNotes": 14,
    "pushedCheckIns": 3,
    "pulledNotes": 2,
    "pulledCheckIns": 0,
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
2. Set `OPENAI_API_KEY`, `ECHO_OPENAI_MODEL`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY`.
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
