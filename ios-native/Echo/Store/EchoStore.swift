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
    var isCheckInFlowPresented = false
    var lastSavedTitle: String?
    var persistenceError: String?
    var weeklyReviewPresentation: WeeklyReviewPresentation?

    private let persistence: EchoPersistence
    @ObservationIgnored private var isDirty = false
    @ObservationIgnored private var autoSyncTask: Task<Void, Never>?
    @ObservationIgnored private var classificationTasks: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var classificationVersions: [String: String] = [:]

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
        if !nextEnabled {
            classifyIfPossible(noteID: note.id)
        }
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
        classifyUnbucketedNotes(includingFailed: true)
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
        classifyUnbucketedNotes(includingFailed: true)
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

    func refreshWidget() {
        WidgetBridge.update(from: state)
    }

    func addDailyCheckInTime() {
        guard state.dailyCheckInPreferences.times.count < 5 else { return }
        let used = Set(state.dailyCheckInPreferences.times)
        let base = state.dailyCheckInPreferences.times.sorted {
            ($0.hour, $0.minute) < ($1.hour, $1.minute)
        }.last ?? .evening
        let candidates = (1...24).map { offset in
            let totalMinutes = (base.hour * 60 + base.minute + offset * 60) % (24 * 60)
            return ReminderTime(hour: totalMinutes / 60, minute: totalMinutes % 60)
        }
        guard let next = candidates.first(where: { !used.contains($0) }) else { return }
        state.dailyCheckInPreferences.times.append(next)
        state.dailyCheckInPreferences.times.sort { ($0.hour, $0.minute) < ($1.hour, $1.minute) }
        state.dailyCheckInPreferences.enabled = true
        state.dailyCheckInPreferences.updatedAt = ISO8601DateFormatter.echo.string(from: .now)
        saveReminderPreferences()
    }

    func updateDailyCheckInTime(at index: Int, date: Date) {
        guard state.dailyCheckInPreferences.times.indices.contains(index) else { return }
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        let updated = ReminderTime(hour: components.hour ?? 20, minute: components.minute ?? 0)
        state.dailyCheckInPreferences.times[index] = updated
        state.dailyCheckInPreferences.times = Array(Set(state.dailyCheckInPreferences.times))
            .sorted { ($0.hour, $0.minute) < ($1.hour, $1.minute) }
        state.dailyCheckInPreferences.enabled = !state.dailyCheckInPreferences.times.isEmpty
        state.dailyCheckInPreferences.updatedAt = ISO8601DateFormatter.echo.string(from: .now)
        saveReminderPreferences()
    }

    func deleteDailyCheckInTime(at index: Int) {
        guard state.dailyCheckInPreferences.times.indices.contains(index) else { return }
        state.dailyCheckInPreferences.times.remove(at: index)
        state.dailyCheckInPreferences.enabled = !state.dailyCheckInPreferences.times.isEmpty
        state.dailyCheckInPreferences.updatedAt = ISO8601DateFormatter.echo.string(from: .now)
        saveReminderPreferences()
    }

    func setWeeklyReviewEnabled(_ enabled: Bool) {
        let now = ISO8601DateFormatter.echo.string(from: .now)
        state.weeklyReviewPreferences.enabled = enabled
        if enabled, state.weeklyReviewPreferences.startsAt == nil {
            state.weeklyReviewPreferences.startsAt = now
        }
        state.weeklyReviewPreferences.updatedAt = now
        saveReminderPreferences()
    }

    func setWeeklyReviewWeekday(_ weekday: Int) {
        state.weeklyReviewPreferences.weekday = min(7, max(1, weekday))
        state.weeklyReviewPreferences.updatedAt = ISO8601DateFormatter.echo.string(from: .now)
        saveReminderPreferences()
    }

    func setWeeklyReviewTime(_ date: Date) {
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        state.weeklyReviewPreferences.hour = components.hour ?? 18
        state.weeklyReviewPreferences.minute = components.minute ?? 0
        state.weeklyReviewPreferences.updatedAt = ISO8601DateFormatter.echo.string(from: .now)
        saveReminderPreferences()
    }

    func refreshReminderSchedule(requestPermission: Bool = false) {
        let daily = state.dailyCheckInPreferences
        let weekly = state.weeklyReviewPreferences
        Task {
            await NotificationService.applyReminderSchedule(
                daily: daily,
                weekly: weekly,
                requestPermissionIfNeeded: requestPermission
            )
        }
    }

    func presentDueReflectionIfNeeded(now: Date = .now) {
        guard !isCheckInFlowPresented, weeklyReviewPresentation == nil else { return }

        if let occurrence = ReflectionScheduler.pendingWeeklyReviewOccurrence(
            preferences: state.weeklyReviewPreferences,
            reviews: state.weeklyReviews,
            now: now
        ) {
            weeklyReviewPresentation = WeeklyReviewPresentation(
                scheduledFor: ISO8601DateFormatter.echo.string(from: occurrence),
                source: "prompt"
            )
            return
        }

        if ReflectionScheduler.pendingDailyCheckIn(
            preferences: state.dailyCheckInPreferences,
            checkIns: state.checkIns,
            now: now
        ) != nil {
            selectedTab = .checkIn
            isCheckInFlowPresented = true
        }
    }

    func presentWeeklyReview(source: String) {
        guard !isCheckInFlowPresented else { return }
        let occurrence = ReflectionScheduler.pendingWeeklyReviewOccurrence(
            preferences: state.weeklyReviewPreferences,
            reviews: state.weeklyReviews
        ) ?? ReflectionScheduler.latestWeeklyReviewOccurrence(
            preferences: state.weeklyReviewPreferences
        ) ?? .now
        weeklyReviewPresentation = WeeklyReviewPresentation(
            scheduledFor: ISO8601DateFormatter.echo.string(from: occurrence),
            source: source
        )
    }

    func saveWeeklyReview(scheduledFor: String, reflection: String, nextWeekIntent: String) {
        let reflection = reflection.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextWeekIntent = nextWeekIntent.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !reflection.isEmpty, !nextWeekIntent.isEmpty else { return }
        let now = ISO8601DateFormatter.echo.string(from: .now)
        if let index = state.weeklyReviews.firstIndex(where: { $0.scheduledFor == scheduledFor }) {
            state.weeklyReviews[index].reflection = reflection
            state.weeklyReviews[index].nextWeekIntent = nextWeekIntent
            state.weeklyReviews[index].updatedAt = now
        } else {
            state.weeklyReviews.append(
                WeeklyReview(
                    id: "weekly-review-\(Int(Date.now.timeIntervalSince1970 * 1_000))-\(UUID().uuidString.prefix(6).lowercased())",
                    scheduledFor: scheduledFor,
                    completedAt: now,
                    updatedAt: now,
                    reflection: reflection,
                    nextWeekIntent: nextWeekIntent
                )
            )
        }
        state.weeklyReviews.sort { $0.scheduledFor > $1.scheduledFor }
        weeklyReviewPresentation = nil
        persist(markDirty: true)
        if ReflectionScheduler.pendingDailyCheckIn(
            preferences: state.dailyCheckInPreferences,
            checkIns: state.checkIns
        ) != nil {
            selectedTab = .checkIn
            isCheckInFlowPresented = true
        }
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
        resumePendingClassifications()
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
            refreshReminderSchedule()
        } catch {
            syncStatus.isSyncing = false
            syncStatus.lastError = error.localizedDescription
            await NotificationService.notifySyncFailure(error.localizedDescription)
        }
    }

    func syncOnLaunch() async {
        if config.isConfigured {
            await syncNow()
        }
        resumePendingClassifications()
    }

    func syncOnForeground() async {
        if config.isConfigured, syncIsStale {
            await syncNow()
        }
        resumePendingClassifications()
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
            selectedTab = .echo
            echoPath = [.note(parts[1].removingPercentEncoding ?? parts[1])]
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

    private func saveReminderPreferences() {
        persist(markDirty: true)
        refreshReminderSchedule(requestPermission: true)
    }

    func resumePendingClassifications() {
        clearLegacyKeywordClassifications()
        if categorizationIsAvailable {
            classifyUnbucketedNotes(includingFailed: true)
        } else {
            settlePendingClassifications()
        }
    }

    private func clearLegacyKeywordClassifications() {
        var changed = false
        func clearingKeywordResult(_ note: EchoNote) -> EchoNote {
            guard note.classificationMethod == .keyword else { return note }
            var result = note
            result.bucket = nil
            result.classificationStatus = .pending
            result.classificationMethod = .unknown
            result.classificationConfidence = nil
            changed = true
            return result
        }

        state.recent = state.recent.map(clearingKeywordResult)
        state.reviewed = state.reviewed.map(clearingKeywordResult)
        if changed {
            persist(markDirty: true)
        }
    }

    private func classifyIfPossible(noteID: String) {
        guard
            let snapshot = note(id: noteID),
            !snapshot.echo.enabled,
            snapshot.bucket == nil,
            snapshot.classificationStatus == .pending
        else { return }
        guard categorizationIsAvailable else {
            markClassificationFailed(noteID: noteID, updatedAt: snapshot.updatedAt)
            return
        }
        let config = config
        let buckets = state.bucketPreferences.customs

        classificationTasks[noteID]?.cancel()
        classificationVersions[noteID] = snapshot.updatedAt
        let task = Task { [weak self] in
            guard let self else { return }
            defer {
                if classificationVersions[noteID] == snapshot.updatedAt {
                    classificationTasks[noteID] = nil
                    classificationVersions[noteID] = nil
                }
            }
            do {
                let response = try await EchoAPIClient(config: config).classify(note: snapshot, buckets: buckets)
                guard !Task.isCancelled else { return }
                guard
                    var note = note(id: noteID),
                    note.updatedAt == snapshot.updatedAt
                else { return }
                let title = response.title.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !title.isEmpty, buckets.contains(where: { $0.name == response.bucket }) else {
                    markClassificationFailed(noteID: noteID, updatedAt: snapshot.updatedAt)
                    return
                }
                note.title = snapshot.body.count <= 32 ? ModelFactories.noteTitle(from: snapshot.body) : title
                note.bucket = response.bucket
                note.classificationStatus = .classified
                note.classificationMethod = .ai
                note.classificationConfidence = response.confidence
                replace(note)
                persist(markDirty: true)
            } catch {
                guard !Task.isCancelled else { return }
                markClassificationFailed(noteID: noteID, updatedAt: snapshot.updatedAt)
            }
        }
        classificationTasks[noteID] = task
    }

    private func classifyUnbucketedNotes(includingFailed: Bool = false) {
        let candidates = state.allNotes.filter { note in
            !note.echo.enabled
                && note.bucket == nil
                && (note.classificationStatus == .pending
                    || (includingFailed && note.classificationStatus == .failed))
        }
        for var note in candidates {
            if note.classificationStatus == .failed {
                note.classificationStatus = .pending
                note.classificationMethod = .unknown
                note.classificationConfidence = nil
                replace(note)
                persist(markDirty: true)
            }
            classifyIfPossible(noteID: note.id)
        }
    }

    private var categorizationIsAvailable: Bool {
        config.aiCategorizationEnabled
            && config.isConfigured
            && !state.bucketPreferences.customs.isEmpty
    }

    private func settlePendingClassifications() {
        let pending = state.allNotes.filter {
            !$0.echo.enabled && $0.bucket == nil && $0.classificationStatus == .pending
        }
        for note in pending {
            markClassificationFailed(noteID: note.id, updatedAt: note.updatedAt)
        }
    }

    private func markClassificationFailed(noteID: String, updatedAt: String) {
        guard var note = note(id: noteID), note.updatedAt == updatedAt else { return }
        note.classificationStatus = .failed
        note.classificationMethod = .unknown
        note.classificationConfidence = nil
        replace(note)
        persist(markDirty: true)
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
