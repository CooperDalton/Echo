import Foundation
import WidgetKit

enum WidgetBridge {
    static func update(from state: NotesState, now: Date = .now) {
        guard let url = EchoSharedContainer.widgetSnapshotURL() else { return }
        let snapshot = WidgetSnapshot(
            entries: entries(from: state, now: now),
            updatedAt: ISO8601DateFormatter.echo.string(from: now)
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(snapshot) else { return }
        try? data.write(to: url, options: .atomic)
        WidgetCenter.shared.reloadTimelines(ofKind: "EchoWidget")
    }

    static func entries(from state: NotesState, now: Date = .now) -> [WidgetEntryPayload] {
        guard state.widgetPreferences.enabled else {
            return [WidgetEntryPayload(id: "paused", kind: .empty, text: "Echo widget is paused.", targetURL: nil)]
        }

        let due = state.allNotes
            .filter { EchoScheduler.isDue($0.echo, now: now) }
            .sorted { $0.echo.nextDueAt < $1.echo.nextDueAt }
            .prefix(3)
            .map {
                WidgetEntryPayload(
                    id: "echo-\($0.id)",
                    kind: .echo,
                    text: ModelFactories.compactWidgetText($0.widgetText ?? $0.body),
                    targetURL: "echo://note/\($0.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? $0.id)"
                )
            }

        guard due.count < 3, state.widgetPreferences.includeStandingMessages else { return Array(due) }
        let standing = state.standingMessages.prefix(3 - due.count).map {
            WidgetEntryPayload(
                id: "standing-\($0.id)",
                kind: .standing,
                text: ModelFactories.compactWidgetText($0.text),
                targetURL: "echo://standing/\($0.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? $0.id)"
            )
        }
        return Array(due) + standing
    }
}
