import Foundation

enum NoteClassificationStatus: String, Codable, Hashable, Sendable {
    case pending
    case classified
    case failed
}

enum NoteClassificationMethod: String, Codable, Hashable, Sendable {
    case ai
    case manual
    case keyword
    case unknown
}

enum EchoState: String, Codable, Hashable, Sendable {
    case new
    case due
    case reviewed
}

struct EchoSchedule: Codable, Hashable, Sendable {
    var enabled: Bool
    var state: EchoState
    var lastReviewedAt: String?
    var nextDueAt: String
    var intervalDays: Int
    var ease: Double
    var occurrenceCount: Int
    var scheduledDates: [String]
}

struct EchoNote: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var title: String
    var body: String
    var createdAt: String
    var updatedAt: String
    var bucket: String?
    var classificationStatus: NoteClassificationStatus
    var classificationMethod: NoteClassificationMethod
    var classificationConfidence: Double?
    var widgetText: String?
    var echo: EchoSchedule
    var filePath: String?
}

struct StandingMessage: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var text: String
    var createdAt: String
    var updatedAt: String
}

struct BucketDraft: Codable, Hashable, Sendable {
    var name: String
    var description: String
    var colorKey: String
}

struct BucketPreferences: Codable, Hashable, Sendable {
    var customs: [BucketDraft]
}

struct WidgetPreferences: Codable, Hashable, Sendable {
    var enabled: Bool
    var includeStandingMessages: Bool

    static let `default` = WidgetPreferences(enabled: true, includeStandingMessages: true)
}

struct ReminderTime: Codable, Hashable, Identifiable, Sendable {
    var hour: Int
    var minute: Int

    var id: String { String(format: "%02d:%02d", hour, minute) }

    static let evening = ReminderTime(hour: 20, minute: 0)
}

struct DailyCheckInPreferences: Codable, Hashable, Sendable {
    var enabled: Bool
    var times: [ReminderTime]
    var updatedAt: String?

    static let `default` = DailyCheckInPreferences(
        enabled: true,
        times: [.evening],
        updatedAt: nil
    )

    var normalized: DailyCheckInPreferences {
        var result = self
        result.enabled = !result.times.isEmpty
        return result
    }
}

struct WeeklyReview: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var scheduledFor: String
    var completedAt: String
    var updatedAt: String
    var reflection: String
    var nextWeekIntent: String
}

struct WeeklyReviewPreferences: Codable, Hashable, Sendable {
    var enabled: Bool
    var weekday: Int
    var hour: Int
    var minute: Int
    var startsAt: String?
    var updatedAt: String?

    static let `default` = WeeklyReviewPreferences(
        enabled: false,
        weekday: 1,
        hour: 18,
        minute: 0,
        startsAt: nil,
        updatedAt: nil
    )
}

struct DeletedNote: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var filePath: String?
    var deletedAt: String
}

enum CheckInKind: String, Codable, Hashable, Sendable {
    case evening
    case random
}

enum CheckInSource: String, Codable, Hashable, Sendable {
    case mobile
    case obsidian
}

struct CheckIn: Codable, Hashable, Identifiable, Sendable {
    var id: String
    var createdAt: String
    var kind: CheckInKind
    var source: CheckInSource
    var energy: Int
    var emotions: [String: Bool]
    var body: String
    var filePath: String?
}

struct NotesState: Codable, Hashable, Sendable {
    var recent: [EchoNote]
    var reviewed: [EchoNote]
    var checkIns: [CheckIn]
    var deletedNotes: [DeletedNote]
    var bucketPreferences: BucketPreferences
    var standingMessages: [StandingMessage]
    var widgetPreferences: WidgetPreferences
    var weeklyReviews: [WeeklyReview]
    var weeklyReviewPreferences: WeeklyReviewPreferences
    var dailyCheckInPreferences: DailyCheckInPreferences

    init(
        recent: [EchoNote],
        reviewed: [EchoNote],
        checkIns: [CheckIn],
        deletedNotes: [DeletedNote],
        bucketPreferences: BucketPreferences,
        standingMessages: [StandingMessage],
        widgetPreferences: WidgetPreferences,
        weeklyReviews: [WeeklyReview],
        weeklyReviewPreferences: WeeklyReviewPreferences,
        dailyCheckInPreferences: DailyCheckInPreferences
    ) {
        self.recent = recent
        self.reviewed = reviewed
        self.checkIns = checkIns
        self.deletedNotes = deletedNotes
        self.bucketPreferences = bucketPreferences
        self.standingMessages = standingMessages
        self.widgetPreferences = widgetPreferences
        self.weeklyReviews = weeklyReviews
        self.weeklyReviewPreferences = weeklyReviewPreferences
        self.dailyCheckInPreferences = dailyCheckInPreferences
    }

    private enum CodingKeys: String, CodingKey {
        case recent
        case reviewed
        case checkIns
        case deletedNotes
        case bucketPreferences
        case standingMessages
        case widgetPreferences
        case weeklyReviews
        case weeklyReviewPreferences
        case dailyCheckInPreferences
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        recent = try container.decodeIfPresent([EchoNote].self, forKey: .recent) ?? []
        reviewed = try container.decodeIfPresent([EchoNote].self, forKey: .reviewed) ?? []
        checkIns = try container.decodeIfPresent([CheckIn].self, forKey: .checkIns) ?? []
        deletedNotes = try container.decodeIfPresent([DeletedNote].self, forKey: .deletedNotes) ?? []
        bucketPreferences = try container.decodeIfPresent(BucketPreferences.self, forKey: .bucketPreferences)
            ?? BucketPreferences(customs: [])
        standingMessages = try container.decodeIfPresent([StandingMessage].self, forKey: .standingMessages) ?? []
        widgetPreferences = try container.decodeIfPresent(WidgetPreferences.self, forKey: .widgetPreferences)
            ?? .default
        weeklyReviews = try container.decodeIfPresent([WeeklyReview].self, forKey: .weeklyReviews) ?? []
        weeklyReviewPreferences = try container.decodeIfPresent(
            WeeklyReviewPreferences.self,
            forKey: .weeklyReviewPreferences
        ) ?? .default
        dailyCheckInPreferences = (try container.decodeIfPresent(
            DailyCheckInPreferences.self,
            forKey: .dailyCheckInPreferences
        ) ?? .default).normalized
    }

    static let empty = NotesState(
        recent: [],
        reviewed: [],
        checkIns: [],
        deletedNotes: [],
        bucketPreferences: BucketPreferences(customs: []),
        standingMessages: [],
        widgetPreferences: .default,
        weeklyReviews: [],
        weeklyReviewPreferences: .default,
        dailyCheckInPreferences: .default
    )

    var allNotes: [EchoNote] {
        recent + reviewed
    }
}

struct EchoSyncConfig: Codable, Hashable, Sendable {
    var apiBaseUrl: String?
    var apiToken: String?
    var deviceId: String
    var syncEnabled: Bool
    var aiCategorizationEnabled: Bool

    static func fresh() -> EchoSyncConfig {
        let bundle = Bundle.main
        func configuredValue(_ key: String) -> String? {
            guard let raw = bundle.object(forInfoDictionaryKey: key) as? String else { return nil }
            let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty, !value.hasPrefix("$(") else { return nil }
            return value
        }
        return EchoSyncConfig(
            apiBaseUrl: configuredValue("EXPO_PUBLIC_ECHO_API_URL"),
            apiToken: configuredValue("EXPO_PUBLIC_ECHO_API_TOKEN"),
            deviceId: "device-\(UUID().uuidString.lowercased())",
            syncEnabled: true,
            aiCategorizationEnabled: true
        )
    }

    var isConfigured: Bool {
        syncEnabled && !(apiBaseUrl?.isEmpty ?? true) && !(apiToken?.isEmpty ?? true)
    }
}

enum EchoTab: Hashable {
    case capture
    case library
    case echo
    case checkIn
}

enum AppRoute: Hashable {
    case note(String)
    case standing(String)
    case settings
}

struct WeeklyReviewPresentation: Identifiable, Hashable, Sendable {
    var scheduledFor: String
    var source: String

    var id: String { "\(scheduledFor)-\(source)" }
}

struct SyncStatus: Hashable, Sendable {
    var isSyncing = false
    var lastSyncedAt: String?
    var lastError: String?

    var label: String {
        if isSyncing { return "Syncing…" }
        if lastError != nil { return "Sync failed" }
        if lastSyncedAt != nil { return "Synced" }
        return "Ready to sync"
    }
}
