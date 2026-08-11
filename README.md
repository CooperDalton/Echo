# Echo

Echo is a native SwiftUI personal notes and reflection app for iOS. It stores
notes, check-ins, weekly reviews, reminder preferences, categories, and standing
messages locally, surfaces scheduled echoes through a WidgetKit extension, and
optionally syncs through a Vercel backend into Supabase.

## Repository layout

- `ios-native/` — current iOS app, widget, tests, and Xcode project.
- `backend/` — authenticated Vercel API for sync, classification, and widget-text shortening.
- `supabase/` — database schema, migrations, and local Supabase configuration.

The retired Expo client remains available in Git history before its removal.

## Native iOS app

Open `ios-native/Echo.xcodeproj` in Xcode, or build from the command line:

```bash
xcodebuild -project ios-native/Echo.xcodeproj -scheme Echo \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO build
```

The app works locally without backend credentials. To enable cloud sync and
server-side classification, supply these build settings:

```text
EXPO_PUBLIC_ECHO_API_URL=https://your-backend.example.com
EXPO_PUBLIC_ECHO_API_TOKEN=replace-with-a-long-random-token
```

Those names are retained for configuration compatibility; the app itself is
fully native and does not depend on Expo.

See `ios-native/README.md` for device installation, signing, and compatibility
details.

## Backend

Create `backend/.env` with:

```bash
PORT=8787
OPENAI_API_KEY=sk-...
ECHO_OPENAI_MODEL=gpt-5-nano
ECHO_API_TOKEN=replace-with-a-long-random-token
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Then install and validate it independently:

```bash
cd backend
npm install
npm run typecheck
npm run compile
npx vercel dev --listen 8787
```

The service-role key is server-only. The native app communicates exclusively
with the authenticated `/api/mobile/*` endpoints and never connects directly to
Supabase.

## Supabase

`supabase/schema.sql` defines the complete current schema. Incremental changes
are kept in `supabase/migrations/`. All application tables use row-level
security, with backend access granted through the Supabase service role.
