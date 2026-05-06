# Echo

Echo is a local-first personal notes and reflection app built with Expo. Notes and check-ins live as Markdown files inside a GitHub-friendly `life-os` vault that can be opened directly in Obsidian.

## Vault Shape

```text
life-os/
  README.md
  Echo/
    Notes/
      2026/
        04/
          2026-04-29-1432-note-short-title.md
    Checkins/
      2026/
        04/
          2026-04-29-2000-evening.md
    Attachments/
      2026/
        04/
    _system/
      buckets.yml
      schema.md
```

## Current Capabilities

- Capture Markdown-backed notes.
- Save daily check-ins with fixed energy and emotion fields.
- Serialize YAML frontmatter for notes and check-ins.
- Surface due Echo cards from note scheduling metadata.
- Classify notes through the backend only.
- Sync local vault snapshots to a backend that coordinates GitHub sync.

## Environment

Set these in your Expo environment:

```bash
EXPO_PUBLIC_ECHO_API_URL=https://your-backend.example.com
EXPO_PUBLIC_ECHO_GITHUB_OWNER=your-github-user-or-org
EXPO_PUBLIC_ECHO_GITHUB_REPO=life-os
EXPO_PUBLIC_ECHO_GITHUB_BRANCH=main
```

Set these in `backend/.env` for local development, or add them as Vercel project environment variables when deployed:

```bash
PORT=8787
OPENAI_API_KEY=sk-...
ECHO_OPENAI_MODEL=gpt-5.4-nano
GITHUB_TOKEN=github_pat_...
GITHUB_WEBHOOK_SECRET=replace-me
```

## Backend Contract

The app now expects these JSON endpoints:

### `POST /api/mobile/classify-note`

Request:

```json
{
  "repo": {
    "owner": "your-github-user-or-org",
    "name": "life-os",
    "branch": "main"
  },
  "note": {
    "id": "note-20260429-143245-a8f2",
    "title": "Idea for GitHub-backed notes",
    "body": "The actual note body goes here.",
    "createdAt": "2026-04-29T14:32:45-07:00",
    "updatedAt": "2026-04-29T14:32:45-07:00"
  }
}
```

Response:

  ```json
  {
    "title": "GitHub Note Sync",
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
  "repo": {
    "owner": "your-github-user-or-org",
    "name": "life-os",
    "branch": "main"
  },
  "snapshot": {
    "notes": [],
    "checkIns": []
  }
}
```

Response:

```json
{
  "notes": [],
  "checkIns": [],
  "syncedAt": "2026-04-30T19:45:00-07:00",
  "summary": {
    "pushedNotes": 14,
    "pushedCheckIns": 3,
    "pulledNotes": 2,
    "pulledCheckIns": 0
  }
}
```

The backend treats GitHub as the source of truth, returns the merged note/check-in snapshot to the app, and exposes `POST /api/github/webhook` for future push-driven invalidation.

## Vercel Backend

The backend is now structured as Vercel Functions under [backend/api](/C:/Users/wizdr/Desktop/Code/Echo/backend/api) with shared logic in [backend/src](/C:/Users/wizdr/Desktop/Code/Echo/backend/src).

Important files:

- [backend/vercel.json](/C:/Users/wizdr/Desktop/Code/Echo/backend/vercel.json)
- [backend/api/health.ts](/C:/Users/wizdr/Desktop/Code/Echo/backend/api/health.ts)
- [backend/api/mobile/classify-note.ts](/C:/Users/wizdr/Desktop/Code/Echo/backend/api/mobile/classify-note.ts)
- [backend/api/mobile/sync.ts](/C:/Users/wizdr/Desktop/Code/Echo/backend/api/mobile/sync.ts)
- [backend/api/github/webhook.ts](/C:/Users/wizdr/Desktop/Code/Echo/backend/api/github/webhook.ts)

Local backend development:

```bash
npm run backend:dev
```

To deploy on Vercel:

1. Create a Vercel project rooted at `backend/`
2. Set `OPENAI_API_KEY`, `ECHO_OPENAI_MODEL`, `GITHUB_TOKEN`, and `GITHUB_WEBHOOK_SECRET`
3. Deploy
4. Point `EXPO_PUBLIC_ECHO_API_URL` at the deployed Vercel URL

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

After linking the `backend/` directory to an actual Vercel project, you can also run:

```bash
cd backend
npm run vercel:build
```
