import Foundation
import WidgetKit

enum WidgetBridge {
    static func update(from state: NotesState, now: Date = .now) {
        guard let url = EchoSharedContainer.widgetSnapshotURL() else {
            print("[WidgetBridge] App Group container is unavailable.")
            return
        }
        let snapshot = WidgetSnapshot(
            entries: snapshotEntries(from: state, now: now),
            updatedAt: ISO8601DateFormatter.echo.string(from: now)
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        guard let data = try? encoder.encode(snapshot) else {
            print("[WidgetBridge] Snapshot encoding failed.")
            return
        }
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            print("[WidgetBridge] Snapshot write failed: \(error.localizedDescription)")
            return
        }
        WidgetCenter.shared.reloadTimelines(ofKind: "EchoWidget")
    }

    static func entries(from state: NotesState, now: Date = .now) -> [WidgetEntryPayload] {
        let snapshot = WidgetSnapshot(
            entries: snapshotEntries(from: state, now: now),
            updatedAt: ISO8601DateFormatter.echo.string(from: now)
        )
        return Array(snapshot.visibleEntries(at: now).prefix(3))
    }

    private static func snapshotEntries(from state: NotesState, now: Date) -> [WidgetEntryPayload] {
        guard state.widgetPreferences.enabled else {
            return [WidgetEntryPayload(id: "paused", kind: .empty, text: "Echo widget is paused.", targetURL: nil)]
        }

        let calendar = Calendar.current

        var echoes: [WidgetEntryPayload] = []
        for note in state.allNotes {
            let targetURL = "echo://note/\(note.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? note.id)"
            let text = ModelFactories.compactWidgetText(note.widgetText ?? note.body)

            if note.echo.enabled {
                for occurrence in EchoScheduler.occurrences(for: note.echo) {
                    let dueDay = calendar.startOfDay(for: occurrence.date)
                    let expiresAt = calendar.date(byAdding: .day, value: 1, to: dueDay)
                    echoes.append(WidgetEntryPayload(
                        id: "echo-\(note.id)-\(occurrence.number)",
                        kind: .echo,
                        text: text,
                        targetURL: targetURL,
                        visibleFrom: ISO8601DateFormatter.echo.string(from: occurrence.date),
                        visibleUntil: expiresAt.map { ISO8601DateFormatter.echo.string(from: $0) }
                    ))
                }
            }
        }
        echoes.sort { ($0.visibleFrom ?? "") < ($1.visibleFrom ?? "") }

        guard state.widgetPreferences.includeStandingMessages else { return echoes }
        let standing = state.standingMessages.map {
            WidgetEntryPayload(
                id: "standing-\($0.id)",
                kind: .standing,
                text: ModelFactories.compactWidgetText($0.text),
                targetURL: "echo://standing/\($0.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? $0.id)"
            )
        }
        return echoes + standing
    }
}
