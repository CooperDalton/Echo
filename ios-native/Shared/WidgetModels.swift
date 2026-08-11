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
}

struct WidgetSnapshot: Codable, Sendable {
    let entries: [WidgetEntryPayload]
    let updatedAt: String
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

