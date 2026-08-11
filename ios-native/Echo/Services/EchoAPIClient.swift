import Foundation

struct SyncRequestBody: Codable, Sendable {
    struct Snapshot: Codable, Sendable {
        let notes: [EchoNote]
        let checkIns: [CheckIn]
        let deletedNotes: [DeletedNote]
        let bucketPreferences: BucketPreferences
        let standingMessages: [StandingMessage]
        let weeklyReviews: [WeeklyReview]
        let weeklyReviewPreferences: WeeklyReviewPreferences
        let dailyCheckInPreferences: DailyCheckInPreferences
    }

    let deviceId: String
    let snapshot: Snapshot
}

struct SyncResponseBody: Codable, Sendable {
    struct Summary: Codable, Sendable {
        var pushedNotes: Int?
        var pushedCheckIns: Int?
        var pulledNotes: Int?
        var pulledCheckIns: Int?
    }

    var notes: [EchoNote]?
    var checkIns: [CheckIn]?
    var deletedNotes: [DeletedNote]?
    var bucketPreferences: BucketPreferences?
    var standingMessages: [StandingMessage]?
    var weeklyReviews: [WeeklyReview]?
    var weeklyReviewPreferences: WeeklyReviewPreferences?
    var dailyCheckInPreferences: DailyCheckInPreferences?
    var syncedAt: String?
    var summary: Summary?
}

struct ClassificationResponse: Codable, Sendable {
    var title: String?
    var bucket: String?
    var confidence: Double?
    var method: String?
    var model: String?
}

enum EchoAPIError: LocalizedError, Sendable {
    case notConfigured
    case invalidURL
    case requestFailed(Int)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .notConfigured: "Sync is not configured."
        case .invalidURL: "The Echo API URL is invalid."
        case .requestFailed(let status): "Echo API request failed with status \(status)."
        case .invalidResponse: "Echo API returned an invalid response."
        }
    }
}

struct EchoAPIClient: Sendable {
    let config: EchoSyncConfig

    func sync(state: NotesState) async throws -> SyncResponseBody {
        let payload = SyncRequestBody(
            deviceId: config.deviceId,
            snapshot: .init(
                notes: state.allNotes,
                checkIns: state.checkIns,
                deletedNotes: state.deletedNotes,
                bucketPreferences: state.bucketPreferences,
                standingMessages: state.standingMessages,
                weeklyReviews: state.weeklyReviews,
                weeklyReviewPreferences: state.weeklyReviewPreferences,
                dailyCheckInPreferences: state.dailyCheckInPreferences
            )
        )
        return try await post(path: "/api/mobile/sync", body: payload)
    }

    func classify(note: EchoNote, buckets: [BucketDraft]) async throws -> ClassificationResponse {
        struct ClassificationNote: Codable, Sendable {
            let id: String
            let title: String
            let body: String
            let createdAt: String
            let updatedAt: String
        }
        struct ClassificationRequest: Codable, Sendable {
            let note: ClassificationNote
            let buckets: [BucketDraft]
        }

        return try await post(
            path: "/api/mobile/classify-note",
            body: ClassificationRequest(
                note: ClassificationNote(
                    id: note.id,
                    title: note.title,
                    body: note.body,
                    createdAt: note.createdAt,
                    updatedAt: note.updatedAt
                ),
                buckets: buckets
            )
        )
    }

    private func post<Body: Encodable & Sendable, Response: Decodable & Sendable>(
        path: String,
        body: Body
    ) async throws -> Response {
        guard config.isConfigured, let token = config.apiToken else { throw EchoAPIError.notConfigured }
        let base = config.apiBaseUrl?.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""
        guard let url = URL(string: base + path) else { throw EchoAPIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw EchoAPIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw EchoAPIError.requestFailed(http.statusCode) }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}
