import Foundation

enum SyncMerger {
    static func merge(local: NotesState, response: SyncResponseBody) -> NotesState {
        let deleted = mergeByID(
            local.deletedNotes,
            response.deletedNotes ?? local.deletedNotes,
            id: \.id,
            timestamp: \.deletedAt
        )
        let deletedIDs = Set(deleted.map(\.id))
        let remoteNotes = response.notes ?? []
        let notes = mergeByID(
            local.allNotes,
            remoteNotes,
            id: \.id,
            timestamp: \.updatedAt
        ).filter { !deletedIDs.contains($0.id) }
        let checkIns = mergeByID(
            local.checkIns,
            response.checkIns ?? [],
            id: \.id,
            timestamp: \.createdAt
        )

        return NotesState(
            recent: notes.filter { $0.echo.state != .reviewed }.sorted { $0.createdAt > $1.createdAt },
            reviewed: notes.filter { $0.echo.state == .reviewed }.sorted { $0.createdAt > $1.createdAt },
            checkIns: checkIns.sorted { $0.createdAt > $1.createdAt },
            deletedNotes: deleted.sorted { $0.deletedAt > $1.deletedAt },
            bucketPreferences: local.bucketPreferences,
            standingMessages: local.standingMessages.isEmpty
                ? (response.standingMessages ?? [])
                : local.standingMessages,
            widgetPreferences: local.widgetPreferences
        )
    }

    private static func mergeByID<Value>(
        _ local: [Value],
        _ remote: [Value],
        id: KeyPath<Value, String>,
        timestamp: KeyPath<Value, String>
    ) -> [Value] {
        var values: [String: Value] = [:]
        for value in local + remote {
            let key = value[keyPath: id]
            guard let existing = values[key] else {
                values[key] = value
                continue
            }
            if value[keyPath: timestamp] >= existing[keyPath: timestamp] {
                values[key] = value
            }
        }
        return Array(values.values)
    }
}
