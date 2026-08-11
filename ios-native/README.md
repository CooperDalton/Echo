# Echo for iOS

Native SwiftUI rebuild of Echo. The Expo app is the specification for screen
copy, layout, ordering, routes, and interaction behavior; the existing backend
and data formats remain the source of truth.

The native client uses a dark plum/violet visual system with warm amber actions,
soft lavender type, and mint reserved for reviewed or positive states. That skin
is applied without redesigning the established Expo product structure.

## Generate and run

```bash
cd ios-native
xcodegen generate
xcodebuild -project Echo.xcodeproj -scheme Echo \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro,OS=18.5' \
  -derivedDataPath /tmp/echo-native-derived test
```

If this checkout is stored in an iCloud/File Provider folder, let Xcode use its default Derived Data location or use a temporary path outside the checkout. Extended Finder metadata can otherwise interfere with simulator code signing.

The project is configured for Cooper's Apple development team (`TC5U393653`).
Xcode can therefore manage signing automatically when that account is signed in.

## Install on Cooper's iPhone

1. In Xcode, open **Xcode > Settings > Accounts** and sign in with the Apple ID
   that owns team `TC5U393653`. Xcode needs the account once to create the app
   and widget provisioning profiles; a matching development certificate is
   already present in this Mac's Keychain.
2. Keep the paired iPhone unlocked, then open `Echo.xcodeproj`, choose
   **iPhone (66)** as the run destination, and press **Run**. Developer Mode is
   already enabled on the phone. If iOS asks whether to trust the developer,
   approve the prompt and run once more.

The device is already paired with this Mac and detected by Xcode. No App Store,
TestFlight, Expo Go, backend deployment, or API keys are required for this
personal installation.

The backend is optional. Local capture, check-ins, categories, standing
messages, and the widget work without any API configuration. Cloud sync and
server-side classification remain dormant unless `EXPO_PUBLIC_ECHO_API_URL` and
`EXPO_PUBLIC_ECHO_API_TOKEN` are supplied as build settings. The Supabase
service-role key remains server-only.

## Compatibility promises

- Bundle ID: `com.cooperdalton.echo`
- Widget bundle ID: `com.cooperdalton.echo.ExpoWidgetsTarget`
- App group: `group.com.cooperdalton.echo`
- URL scheme: `echo://`
- Local state: `echo-notes-v2.json`
- Local sync configuration: `echo-config-v1.json`
- Backend: existing `/api/mobile/*` endpoints

The app never connects directly to Supabase and never embeds the Supabase service-role key.

## Current native milestone

Implemented and simulator-verified:

- Capture a standard or Echo-enabled note with native haptics and spring animation.
- Persist and reload the Expo-compatible JSON state.
- Search, open, edit, review, and delete notes in the native Library.
- Preserve the Expo Capture editor, Library sections/filtering, note routes,
  Echo section order, check-in history/detail modal, and three-step check-in flow.
- Create, edit, and remove custom categories and standing messages.
- Edit prior check-ins and control which content appears in the widget.
- Sync automatically at launch, after returning to the foreground, shortly after
  local edits, and before backgrounding when unsynced changes remain.
- Call the existing sync and classification endpoints.
- Route `echo://note/:id` and `echo://standing/:id` links.
- Schedule local check-in and sync-failure notifications.
- Build a WidgetKit extension using the existing app group and widget bundle ID.

The Expo project remains untouched and can run alongside this migration while feature parity is expanded.
