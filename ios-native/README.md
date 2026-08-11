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

Open `Echo.xcodeproj` to select an Apple development team before installing on a physical iPhone.

Like the Expo build, supply `EXPO_PUBLIC_ECHO_API_URL` and
`EXPO_PUBLIC_ECHO_API_TOKEN` as build settings. For example, append both values
to the `xcodebuild` command or add them as user-defined build settings in Xcode.
They initialize the Expo-compatible `echo-config-v1.json`; the Supabase
service-role key remains server-only. Local capture, check-ins, categories,
standing messages, and the widget work without backend setup.

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
