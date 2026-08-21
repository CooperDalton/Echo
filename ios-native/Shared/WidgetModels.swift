import Foundation

struct WidgetEntryPayload: Codable, Hashable, Identifiable, Sendable {
    enum Kind: String, Codable, Sendable {
        case echo
        case standing
        case empty
    }

    let id: String
    let kind: Kind
    let text: String
    let targetURL: String?
    var visibleFrom: String? = nil
    var visibleUntil: String? = nil

    func isVisible(at date: Date) -> Bool {
        if let visibleFrom, let start = Self.parseDate(visibleFrom), date < start {
            return false
        }
        if let visibleUntil, let end = Self.parseDate(visibleUntil), date >= end {
            return false
        }
        return true
    }

    func nextVisibilityBoundary(after date: Date) -> Date? {
        [visibleFrom, visibleUntil]
            .compactMap { $0.flatMap(Self.parseDate) }
            .filter { $0 > date }
            .min()
    }

    private static func parseDate(_ raw: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: raw) { return date }

        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: raw)
    }
}

struct WidgetSnapshot: Codable, Sendable {
    let entries: [WidgetEntryPayload]
    let updatedAt: String

    func visibleEntries(at date: Date) -> [WidgetEntryPayload] {
        let visible = entries.filter { $0.isVisible(at: date) }
        guard visible.isEmpty else { return visible }
        return [WidgetEntryPayload(
            id: "nothing-due",
            kind: .empty,
            text: "Nothing is due right now.",
            targetURL: nil
        )]
    }

    func nextVisibilityBoundary(after date: Date) -> Date? {
        entries.compactMap { $0.nextVisibilityBoundary(after: date) }.min()
    }
}

enum EchoSharedContainer {
    static let appGroup = "group.com.cooperdalton.echo"
    static let widgetSnapshotFile = "echo-widget-v1.json"

    static func widgetSnapshotURL(fileManager: FileManager = .default) -> URL? {
        fileManager
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent(widgetSnapshotFile)
    }
}
