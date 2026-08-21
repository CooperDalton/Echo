import Foundation

enum ModelFactories {
    static let widgetTextLimit = 240

    static func noteTitle(from body: String) -> String {
        let compact = body.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        guard compact.count > 32 else { return compact }
        return String(compact.prefix(23)).trimmingCharacters(in: .whitespaces) + "..."
    }

    static func note(
        body: String,
        echoEnabled: Bool,
        existingNotes: [EchoNote],
        now: Date = .now,
        id: String? = nil
    ) -> EchoNote {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        let timestamp = ISO8601DateFormatter.echo.string(from: now)
        let noteID = id ?? "note-\(Int(now.timeIntervalSince1970 * 1_000))-\(randomSuffix())"
        var schedule = EchoScheduler.createSchedule(
            noteID: noteID,
            createdAt: timestamp,
            existingNotes: existingNotes
        )
        schedule.enabled = echoEnabled

        let compact = trimmed.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        return EchoNote(
            id: noteID,
            title: noteTitle(from: trimmed),
            body: trimmed,
            createdAt: timestamp,
            updatedAt: timestamp,
            bucket: nil,
            classificationStatus: echoEnabled ? .classified : .pending,
            classificationMethod: .unknown,
            classificationConfidence: nil,
            widgetText: compact.count <= widgetTextLimit ? trimmed : nil,
            echo: schedule,
            filePath: nil
        )
    }

    static func compactWidgetText(_ text: String, limit: Int = widgetTextLimit) -> String {
        let compact = text.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        guard compact.count > limit else { return compact }
        return String(compact.prefix(max(0, limit - 3))).trimmingCharacters(in: .whitespaces) + "..."
    }

    private static func randomSuffix() -> String {
        String(UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: "").prefix(6))
    }
}

extension ISO8601DateFormatter {
    static var echo: ISO8601DateFormatter {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }
}
