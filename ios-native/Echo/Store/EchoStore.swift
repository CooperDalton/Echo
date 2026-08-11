import Foundation
import Observation

@MainActor
@Observable
final class EchoStore {
    var state: NotesState
    var config: EchoSyncConfig
    var syncStatus = SyncStatus()
    var selectedTab: EchoTab = .capture
    var captureEditingNoteID: String?
    var captureReturnTab: EchoTab = .library
    var libraryPath: [AppRoute] = []
    var echoPath: [AppRoute] = []
    var savePulse = 0
    var checkInFlowRequest = 0
    var lastSavedTitle: String?
    var persistenceError: String?

    private let persistence: EchoPersistence
    @ObservationIgnored private var isDirty = false
    @ObservationIgnored private var autoSyncTask: Task<Void, Never>?

    init(persistence: EchoPersistence = EchoPersistence()) {
        self.persistence = persistence
        do {
            state = try persistence.loadState()
            persistenceError = nil
        } catch {
            state = .empty
            persistenceError = "Local notes could not be loaded: \(error.localizedDescription)"
        }
        config = persistence.loadConfig()
        WidgetBridge.update(from: state)
    }

    @discardableResult
    func addNote(body: String, echoEnabled: Bool) -> String? {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let note = ModelFactories.note(
            body: trimmed,
            echoEnabled: echoEnabled,
            existingNotes: state.allNotes
        )
        state.recent.insert(note, at: 0)
        savePulse += 1
        lastSavedTitle = note.title
        persist(markDirty: true)
        if !echoEnabled {
            classifyIfPossible(noteID: note.id)
        }
        return note.id
    }

    func updateNote(id: String, body: String, echoEnabled: Bool? = nil) {
        guard var note = note(id: id) else { return }
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let wasEnabled = note.echo.enabled
        let nextEnabled = echoEnabled ?? wasEnabled
        if nextEnabled && !wasEnabled {
            note.echo = EchoScheduler.createSchedule(
                noteID: note.id,
                createdAt: ISO8601DateFormatter.echo.string(from: .now),
                existingNotes: state.allNotes.filter { $0.id != id }
            )
        }
        note.echo.enabled = nextEnabled
        note.body = trimmed
        note.title = ModelFactories.noteTitle(from: trimmed)
        note.updatedAt = ISO8601DateFormatter.echo.string(from: .now)
        note.bucket = nil
        note.classificationStatus = nextEnabled ? .classified : .pending
        note.classificationMethod = .unknown
        note.classificationConfidence = nil
        note.widgetText = ModelFactories.compactWidgetText(trimmed)
        replace(note)
        persist(markDirty: true)
    }

    func markReviewed(_ id: String) {
        guard var note = note(id: id), note.echo.enabled else { return }
        note.echo = EchoScheduler.review(note.echo)
        note.updatedAt = ISO8601DateFormatter.echo.string(from: .now)
        state.recent.removeAll { $0.id == id }
        state.reviewed.removeAll { $0.id == id }
        state.reviewed.insert(note, at: 0)
        persist(markDirty: true)
    }

    func deleteNote(_ id: String) {
        guard let note = note(id: id) else { return }
        state.recent.removeAll { $0.id == id }
        state.reviewed.removeAll { $0.id == id }
        let tombstone = DeletedNote(
            id: id,
            filePath: note.filePath,
            deletedAt: ISO8601DateFormatter.echo.string(from: .now)
        )
        state.deletedNotes.removeAll { $0.id == id }
        state.deletedNotes.insert(tombstone, at: 0)
        persist(markDirty: true)
    }

    func addCheckIn(
        energy: Int,
        emotions: Set<String>,
        body: String,
        kind: CheckInKind = .evening
    ) {
        let now = Date.now
        let timestamp = ISO8601DateFormatter.echo.string(from: now)
        let known = ["happy", "content", "excited", "bliss", "anxious", "overwhelmed", "sad", "angry"]
        let checkIn = CheckIn(
            id: "checkin-\(Int(now.timeIntervalSince1970 * 1_000))-\(UUID().uuidString.prefix(6).lowercased())",
            createdAt: timestamp,
            kind: kind,
            source: .mobile,
            energy: min(5, max(1, energy)),
            emotions: Dictionary(uniqueKeysWithValues: known.map { ($0, emotions.contains($0)) }),
            body: body.trimmingCharacters(in: .whitespacesAndNewlines),
            filePath: nil
        )
        state.checkIns.insert(checkIn, at: 0)
        savePulse += 1
        persist(markDirty: true)
    }

    func updateCheckIn(id: String, energy: Int, emotions: Set<String>, body: String) {
        guard let index = state.checkIns.firstIndex(where: { $0.id == id }) else { return }
        let known = ["happy", "content", "excited", "bliss", "anxious", "overwhelmed", "sad", "angry"]
        state.checkIns[index].energy = min(5, max(1, energy))
        state.checkIns[index].emotions = Dictionary(
            uniqueKeysWithValues: known.map { ($0, emotions.contains($0)) }
        )
        state.checkIns[index].body = body.trimmingCharacters(in: .whitespacesAndNewlines)
        persist(markDirty: true)
    }

    func addBucket(_ draft: BucketDraft) {
        let normalized = normalizedBucket(draft)
        guard !normalized.name.isEmpty else { return }
        guard !state.bucketPreferences.customs.contains(where: { bucket in
            bucket.name.localizedCaseInsensitiveCompare(normalized.name) == .orderedSame
        }) else { return }
        state.bucketPreferences.customs.append(normalized)
        persist(markDirty: true)
        classifyPendingNotes()
    }

    func updateBucket(at index: Int, with draft: BucketDraft) {
        guard state.bucketPreferences.customs.indices.contains(index) else { return }
        let normalized = normalizedBucket(draft)
        guard !normalized.name.isEmpty else { return }
        guard !state.bucketPreferences.customs.enumerated().contains(where: { offset, bucket in
            offset != index && bucket.name.localizedCaseInsensitiveCompare(normalized.name) == .orderedSame
        }) else { return }

        let previousName = state.bucketPreferences.customs[index].name
        state.bucketPreferences.customs[index] = normalized
        state.recent = state.recent.map { note in
            var note = note
            if note.bucket == previousName { note.bucket = normalized.name }
            return note
        }
        state.reviewed = state.reviewed.map { note in
            var note = note
            if note.bucket == previousName { note.bucket = normalized.name }
            return note
        }
        persist(markDirty: true)
    }

    func deleteBucket(at index: Int) {
        guard state.bucketPreferences.customs.indices.contains(index) else { return }
        let deletedName = state.bucketPreferences.customs.remove(at: index).name
        func clearingBucket(_ note: EchoNote) -> EchoNote {
            guard note.bucket == deletedName else { return note }
            var result = note
            result.bucket = nil
            result.classificationStatus = .pending
            result.classificationMethod = .unknown
            result.classificationConfidence = nil
            return result
        }
        state.recent = state.recent.map(clearingBucket)
        state.reviewed = state.reviewed.map(clearingBucket)
        persist(markDirty: true)
        classifyPendingNotes()
    }

    func upsertStandingMessage(id: String?, text: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        let now = ISO8601DateFormatter.echo.string(from: .now)
        if let id, let index = state.standingMessages.firstIndex(where: { $0.id == id }) {
            state.standingMessages[index].text = trimmed
            state.standingMessages[index].updatedAt = now
        } else {
            state.standingMessages.append(
                StandingMessage(
                    id: "standing-\(Int(Date.now.timeIntervalSince1970 * 1_000))-\(UUID().uuidString.prefix(6).lowercased())",
                    text: trimmed,
                    createdAt: now,
                    updatedAt: now
                )
            )
        }
        persist(markDirty: true)
    }

    func deleteStandingMessage(id: String) {
        state.standingMessages.removeAll { $0.id == id }
        persist(markDirty: true)
    }

    func setWidgetEnabled(_ enabled: Bool) {
        state.widgetPreferences.enabled = enabled
        persist(markDirty: false)
    }

    func setStandingMessagesInWidget(_ enabled: Bool) {
        state.widgetPreferences.includeStandingMessages = enabled
        persist(markDirty: false)
    }

    func saveConfig(_ updated: EchoSyncConfig) {
        config = updated
        do {
            try persistence.saveConfig(updated)
            persistenceError = nil
        } catch {
            persistenceError = "Sync settings could not be saved: \(error.localizedDescription)"
        }
        if updated.isConfigured { scheduleAutoSync() }
    }

    func syncNow() async {
        guard config.isConfigured, !syncStatus.isSyncing else { return }
        syncStatus.isSyncing = true
        syncStatus.lastError = nil
        do {
            let response = try await EchoAPIClient(config: config).sync(state: state)
            state = SyncMerger.merge(local: state, response: response)
            isDirty = false
            syncStatus.isSyncing = false
            syncStatus.lastSyncedAt = response.syncedAt ?? ISO8601DateFormatter.echo.string(from: .now)
            persist(markDirty: false)
        } catch {
            syncStatus.isSyncing = false
            syncStatus.lastError = error.localizedDescription
            await NotificationService.notifySyncFailure(error.localizedDescription)
        }
    }

    func syncOnLaunch() async {
        guard config.isConfigured else { return }
        await syncNow()
    }

    func syncOnForeground() async {
        guard config.isConfigured, syncIsStale else { return }
        await syncNow()
    }

    func syncBeforeBackground() async {
        guard config.isConfigured, isDirty else { return }
        autoSyncTask?.cancel()
        await syncNow()
    }

    func note(id: String) -> EchoNote? {
        state.allNotes.first { $0.id == id }
    }

    func standingMessage(id: String) -> StandingMessage? {
        state.standingMessages.first { $0.id == id }
    }

    func checkIn(id: String) -> CheckIn? {
        state.checkIns.first { $0.id == id }
    }

    func openNoteEditor(id: String, returnTo tab: EchoTab) {
        captureEditingNoteID = id
        captureReturnTab = tab
        selectedTab = .capture
    }

    func closeCaptureEditor() {
        captureEditingNoteID = nil
        selectedTab = captureReturnTab
    }

    func handle(url: URL) {
        guard url.scheme == "echo" else { return }
        let parts = [url.host, url.pathComponents.dropFirst().first]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
        guard parts.count >= 2 else { return }
        switch parts[0] {
        case "note":
            selectedTab = .library
            libraryPath = [.note(parts[1].removingPercentEncoding ?? parts[1])]
        case "standing":
            selectedTab = .echo
            echoPath = [.standing(parts[1].removingPercentEncoding ?? parts[1])]
        default:
            break
        }
    }

    private func replace(_ note: EchoNote) {
        if let index = state.recent.firstIndex(where: { $0.id == note.id }) {
            state.recent[index] = note
        } else if let index = state.reviewed.firstIndex(where: { $0.id == note.id }) {
            state.reviewed[index] = note
        }
    }

    private func persist(markDirty: Bool) {
        do {
            try persistence.saveState(state)
            persistenceError = nil
        } catch {
            persistenceError = "Changes are in memory but could not be saved: \(error.localizedDescription)"
        }
        WidgetBridge.update(from: state)
        if markDirty {
            isDirty = true
            scheduleAutoSync()
        }
    }

    private func classifyIfPossible(noteID: String) {
        guard config.aiCategorizationEnabled, config.isConfigured, !state.bucketPreferences.customs.isEmpty else { return }
        let config = config
        let buckets = state.bucketPreferences.customs
        guard let snapshot = note(id: noteID) else { return }
        Task {
            do {
                let response = try await EchoAPIClient(config: config).classify(note: snapshot, buckets: buckets)
                guard
                    let title = response.title?.trimmingCharacters(in: .whitespacesAndNewlines),
                    let bucket = response.bucket,
                    buckets.contains(where: { $0.name == bucket }),
                    var note = note(id: noteID)
                else { return }
                note.title = snapshot.body.count <= 32 ? ModelFactories.noteTitle(from: snapshot.body) : title
                note.bucket = bucket
                note.classificationStatus = .classified
                note.classificationMethod = .ai
                note.classificationConfidence = response.confidence
                replace(note)
                persist(markDirty: true)
            } catch {
                guard var note = note(id: noteID) else { return }
                note.classificationStatus = .failed
                replace(note)
                persist(markDirty: true)
            }
        }
    }

    private func classifyPendingNotes() {
        for note in state.allNotes where !note.echo.enabled && note.bucket == nil && note.classificationStatus == .pending {
            classifyIfPossible(noteID: note.id)
        }
    }

    private func normalizedBucket(_ draft: BucketDraft) -> BucketDraft {
        BucketDraft(
            name: draft.name.trimmingCharacters(in: .whitespacesAndNewlines),
            description: draft.description.trimmingCharacters(in: .whitespacesAndNewlines),
            colorKey: draft.colorKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "mint"
                : draft.colorKey.trimmingCharacters(in: .whitespacesAndNewlines)
        )
    }

    private var syncIsStale: Bool {
        guard let lastSyncedAt = syncStatus.lastSyncedAt else { return true }
        guard let date = ISO8601DateFormatter.echo.date(from: lastSyncedAt) else { return true }
        return Date.now.timeIntervalSince(date) >= 60
    }

    private func scheduleAutoSync() {
        guard config.isConfigured else { return }
        autoSyncTask?.cancel()
        autoSyncTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(8))
            guard !Task.isCancelled, let self else { return }
            await self.syncNow()
        }
    }
}
