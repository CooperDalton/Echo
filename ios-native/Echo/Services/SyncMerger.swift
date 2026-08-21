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
        let notes = mergeNotes(local.allNotes, remoteNotes)
            .filter { !deletedIDs.contains($0.id) }
        let checkIns = mergeByID(
            local.checkIns,
            response.checkIns ?? [],
            id: \.id,
            timestamp: \.createdAt
        )
        let weeklyReviews = mergeByID(
            local.weeklyReviews,
            response.weeklyReviews ?? [],
            id: \.id,
            timestamp: \.updatedAt
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
            widgetPreferences: local.widgetPreferences,
            weeklyReviews: weeklyReviews.sorted { $0.scheduledFor > $1.scheduledFor },
            weeklyReviewPreferences: newerPreferences(
                local.weeklyReviewPreferences,
                response.weeklyReviewPreferences
            ),
            dailyCheckInPreferences: newerPreferences(
                local.dailyCheckInPreferences,
                response.dailyCheckInPreferences
            )
        )
    }

    private static func newerPreferences(
        _ local: WeeklyReviewPreferences,
        _ remote: WeeklyReviewPreferences?
    ) -> WeeklyReviewPreferences {
        guard let remote else { return local }
        guard let localUpdatedAt = local.updatedAt else { return remote }
        guard let remoteUpdatedAt = remote.updatedAt else { return local }
        return localUpdatedAt >= remoteUpdatedAt ? local : remote
    }

    private static func newerPreferences(
        _ local: DailyCheckInPreferences,
        _ remote: DailyCheckInPreferences?
    ) -> DailyCheckInPreferences {
        guard let remote else { return local.normalized }
        guard let localUpdatedAt = local.updatedAt else { return remote.normalized }
        guard let remoteUpdatedAt = remote.updatedAt else { return local.normalized }
        return (localUpdatedAt >= remoteUpdatedAt ? local : remote).normalized
    }

    private static func mergeNotes(_ local: [EchoNote], _ remote: [EchoNote]) -> [EchoNote] {
        var values: [String: EchoNote] = [:]
        for note in local + remote {
            guard let existing = values[note.id] else {
                values[note.id] = note
                continue
            }
            let existingIsManual = existing.classificationMethod == .manual
            let noteIsManual = note.classificationMethod == .manual
            if existingIsManual != noteIsManual {
                if noteIsManual { values[note.id] = note }
            } else if note.updatedAt >= existing.updatedAt {
                values[note.id] = note
            }
        }
        return Array(values.values)
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
