import Foundation
import SwiftUI
import Testing
import UIKit
@testable import Echo

struct EchoModelsTests {
    @Test func energyLevelsUseDistinctAvailableBatterySymbols() {
        let symbols = (1...5).map(batterySymbol)

        #expect(symbols == ["battery.0", "battery.25", "battery.50", "battery.75", "battery.100"])
        #expect(Set(symbols).count == 5)
        #expect(symbols.allSatisfy { UIImage(systemName: $0) != nil })
    }

    @Test func apiErrorsIncludeTheServerReason() throws {
        let data = Data(#"{"error":"Invalid sync payload."}"#.utf8)
        let error = EchoAPIClient.requestError(status: 400, data: data)

        #expect(error.errorDescription == "Echo API request failed with status 400: Invalid sync payload.")
    }

    @Test func decodesExpoStateWithoutChangingFieldNames() throws {
        let json = """
        {
          "recent": [{
            "id": "note-1",
            "title": "Remember this",
            "body": "Remember this",
            "createdAt": "2026-08-10T20:00:00.000Z",
            "updatedAt": "2026-08-10T20:00:00.000Z",
            "bucket": null,
            "classificationStatus": "pending",
            "classificationMethod": "unknown",
            "classificationConfidence": null,
            "widgetText": "Remember this",
            "echo": {
              "enabled": false,
              "state": "new",
              "lastReviewedAt": null,
              "nextDueAt": "2026-08-11T16:00:00.000Z",
              "intervalDays": 1,
              "ease": 2.5,
              "occurrenceCount": 0,
              "scheduledDates": ["2026-08-11"]
            },
            "filePath": null
          }],
          "reviewed": [],
          "checkIns": [],
          "deletedNotes": [],
          "bucketPreferences": { "customs": [] },
          "standingMessages": [],
          "widgetPreferences": { "enabled": true, "includeStandingMessages": true }
        }
        """

        let state = try JSONDecoder().decode(NotesState.self, from: Data(json.utf8))
        #expect(state.recent.first?.id == "note-1")
        #expect(state.recent.first?.classificationStatus == .pending)
        #expect(state.widgetPreferences.includeStandingMessages)
        #expect(state.weeklyReviewPreferences == .default)
        #expect(state.dailyCheckInPreferences == .default)
    }

    @Test func persistenceUsesExpoFilenamesAndRoundTrips() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        let note = ModelFactories.note(
            body: "A native thought",
            echoEnabled: false,
            existingNotes: [],
            now: Date(timeIntervalSince1970: 1_786_321_200),
            id: "note-test"
        )
        var state = NotesState.empty
        state.recent = [note]

        try persistence.saveState(state)
        let loaded = try persistence.loadState()

        #expect(loaded == state)
        #expect(FileManager.default.fileExists(atPath: directory.appendingPathComponent("echo-notes-v2.json").path))
    }

    @Test func scheduleCreatesSixDeterministicDates() {
        let first = EchoScheduler.createSchedule(
            noteID: "note-stable",
            createdAt: "2026-08-10T20:00:00.000Z",
            existingNotes: []
        )
        let second = EchoScheduler.createSchedule(
            noteID: "note-stable",
            createdAt: "2026-08-10T20:00:00.000Z",
            existingNotes: []
        )
        #expect(first.scheduledDates.count == 6)
        #expect(first.scheduledDates == second.scheduledDates)
        #expect(first.scheduledDates.first == "2026-08-11")
    }

    @Test func tenNewEchoesSpreadTheirFirstAppearancesAcrossFiveDays() {
        let now = Date(timeIntervalSince1970: 1_786_321_200)
        var notes: [EchoNote] = []

        for index in 0..<10 {
            notes.append(ModelFactories.note(
                body: "Kindle highlight \(index)",
                echoEnabled: true,
                existingNotes: notes,
                now: now,
                id: "kindle-highlight-\(index)"
            ))
        }

        let firstAppearances = notes.compactMap { $0.echo.scheduledDates.first }
        let countsByDate = Dictionary(grouping: firstAppearances, by: { $0 }).mapValues { $0.count }

        #expect(countsByDate.count == 5)
        #expect(countsByDate.values.allSatisfy { $0 == 2 })
    }

    @Test func weeklyReviewUsesConfiguredWeekdayAndStopsBeingPendingAfterCompletion() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "America/Los_Angeles"))
        let startsAt = try #require(calendar.date(from: DateComponents(
            year: 2026,
            month: 8,
            day: 1,
            hour: 12
        )))
        let now = try #require(calendar.date(from: DateComponents(
            year: 2026,
            month: 8,
            day: 9,
            hour: 20
        )))
        let preferences = WeeklyReviewPreferences(
            enabled: true,
            weekday: 1,
            hour: 18,
            minute: 0,
            startsAt: ISO8601DateFormatter.echo.string(from: startsAt),
            updatedAt: ISO8601DateFormatter.echo.string(from: startsAt)
        )
        let occurrence = try #require(ReflectionScheduler.pendingWeeklyReviewOccurrence(
            preferences: preferences,
            reviews: [],
            now: now,
            calendar: calendar
        ))
        #expect(calendar.component(.weekday, from: occurrence) == 1)
        #expect(calendar.component(.hour, from: occurrence) == 18)

        let completed = WeeklyReview(
            id: "weekly-review-test",
            scheduledFor: ISO8601DateFormatter.echo.string(from: occurrence),
            completedAt: ISO8601DateFormatter.echo.string(from: now),
            updatedAt: ISO8601DateFormatter.echo.string(from: now),
            reflection: "A good week",
            nextWeekIntent: "Keep going"
        )
        #expect(ReflectionScheduler.pendingWeeklyReviewOccurrence(
            preferences: preferences,
            reviews: [completed],
            now: now,
            calendar: calendar
        ) == nil)
    }

    @Test func eachDailyTimeCanBecomeDueAfterAnEarlierCheckIn() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "America/Los_Angeles"))
        func date(hour: Int, minute: Int) throws -> Date {
            try #require(calendar.date(from: DateComponents(
                year: 2026,
                month: 8,
                day: 10,
                hour: hour,
                minute: minute
            )))
        }
        let preferences = DailyCheckInPreferences(
            enabled: true,
            times: [ReminderTime(hour: 9, minute: 0), ReminderTime(hour: 20, minute: 0)],
            updatedAt: nil
        )
        let morningCheckIn = CheckIn(
            id: "morning",
            createdAt: ISO8601DateFormatter.echo.string(from: try date(hour: 9, minute: 30)),
            kind: .evening,
            source: .mobile,
            energy: 3,
            emotions: [:],
            body: "Morning",
            filePath: nil
        )
        let due = try #require(ReflectionScheduler.pendingDailyCheckIn(
            preferences: preferences,
            checkIns: [morningCheckIn],
            now: try date(hour: 20, minute: 30),
            calendar: calendar
        ))
        #expect(calendar.component(.hour, from: due) == 20)
    }

    @Test func dailyCheckInEnabledStateFollowsWhetherTimesExist() {
        let staleDisabledValue = DailyCheckInPreferences(
            enabled: false,
            times: [.evening],
            updatedAt: nil
        )
        let staleEnabledValue = DailyCheckInPreferences(
            enabled: true,
            times: [],
            updatedAt: nil
        )

        #expect(staleDisabledValue.normalized.enabled)
        #expect(!staleEnabledValue.normalized.enabled)
    }

    @Test @MainActor func foregroundReminderDoesNotReplaceAnOpenCheckIn() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = EchoStore(persistence: EchoPersistence(directory: directory))
        store.state.dailyCheckInPreferences = DailyCheckInPreferences(
            enabled: true,
            times: [ReminderTime(hour: 0, minute: 0)],
            updatedAt: nil
        )
        store.isCheckInFlowPresented = true
        let selectedTab = store.selectedTab

        store.presentDueReflectionIfNeeded(now: Date(timeIntervalSince1970: 1_786_321_200))

        #expect(store.isCheckInFlowPresented)
        #expect(store.weeklyReviewPresentation == nil)
        #expect(store.selectedTab == selectedTab)
    }

    @Test func widgetEntriesKeepExistingDeepLinkShape() {
        let now = Date(timeIntervalSince1970: 1_786_321_200)
        var note = ModelFactories.note(
            body: "Open me from the widget",
            echoEnabled: true,
            existingNotes: [],
            now: now,
            id: "note-widget"
        )
        note.echo.nextDueAt = ISO8601DateFormatter.echo.string(from: now)
        let dayFormatter = DateFormatter()
        dayFormatter.calendar = .current
        dayFormatter.locale = Locale(identifier: "en_US_POSIX")
        dayFormatter.dateFormat = "yyyy-MM-dd"
        note.echo.scheduledDates = [dayFormatter.string(from: now)]
        var state = NotesState.empty
        state.recent = [note]

        let entry = WidgetBridge.entries(from: state, now: now).first
        #expect(entry?.targetURL == "echo://note/note-widget")
    }

    @Test @MainActor func widgetNoteURLUsesEchoPresentation() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = EchoStore(persistence: EchoPersistence(directory: directory))
        let url = try #require(URL(string: "echo://note/note-widget"))

        store.handle(url: url)

        #expect(store.selectedTab == .echo)
        #expect(store.echoPath == [.note("note-widget")])
        #expect(store.libraryPath.isEmpty)
    }

    @Test func widgetEntriesPreserveFiveLineStandingMessage() {
        let message = "Tell your heart that the fear of suffering is worse than the suffering itself. And that no heart has suffered when it goes in search of its dreams, because every second of the search is a second's encounter with God and with eternity."
        var state = NotesState.empty
        state.standingMessages = [StandingMessage(
            id: "standing-five-lines",
            text: message,
            createdAt: "2026-08-20T20:00:00.000Z",
            updatedAt: "2026-08-20T20:00:00.000Z"
        )]

        let entry = WidgetBridge.entries(from: state).first

        #expect(entry?.text == message)
    }

    @Test func echoAppearsOnEveryScheduledDateWithoutReview() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let dueDate = try #require(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 11, hour: 9
        )))
        let laterToday = try #require(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 11, hour: 18
        )))
        let tomorrow = try #require(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 12, hour: 9
        )))
        let secondDate = try #require(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 15, hour: 18
        )))

        var note = ModelFactories.note(
            body: "Bring me back on every scheduled date",
            echoEnabled: true,
            existingNotes: [],
            now: dueDate,
            id: "note-recurring-without-review"
        )
        note.echo.nextDueAt = ISO8601DateFormatter.echo.string(from: dueDate)
        note.echo.scheduledDates = ["2026-08-11", "2026-08-15"]
        var state = NotesState.empty
        state.recent = [note]

        #expect(WidgetBridge.entries(from: state, now: laterToday).first?.text == note.body)
        let tomorrowEntries = WidgetBridge.entries(from: state, now: tomorrow)
        #expect(tomorrowEntries.allSatisfy { $0.kind != .echo })
        #expect(WidgetBridge.entries(from: state, now: secondDate).first?.text == note.body)
    }

    @Test @MainActor func openingAndLeavingADueEchoDoesNotReviewIt() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var note = ModelFactories.note(
            body: "Reading this Echo should not dismiss it",
            echoEnabled: true,
            existingNotes: [],
            id: "echo-opened-without-review"
        )
        let dueAt = Date.now.addingTimeInterval(-60)
        note.echo.nextDueAt = ISO8601DateFormatter.echo.string(from: dueAt)
        let dayFormatter = DateFormatter()
        dayFormatter.calendar = .current
        dayFormatter.locale = Locale(identifier: "en_US_POSIX")
        dayFormatter.dateFormat = "yyyy-MM-dd"
        note.echo.scheduledDates = [dayFormatter.string(from: dueAt)]
        note.echo.state = .due
        var state = NotesState.empty
        state.recent = [note]
        try persistence.saveState(state)
        let store = EchoStore(persistence: persistence)

        let controller = UIHostingController(
            rootView: NoteDetailView(noteID: note.id, mode: .echo).environment(store)
        )
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = controller
        window.makeKeyAndVisible()
        controller.view.layoutIfNeeded()
        await Task.yield()

        window.isHidden = true
        window.rootViewController = nil
        await Task.yield()

        let reopened = try #require(store.note(id: note.id))
        #expect(reopened.echo.state == .due)
        #expect(reopened.echo.occurrenceCount == 0)
        #expect(EchoScheduler.isDue(reopened.echo))
        #expect(store.state.recent.contains { $0.id == note.id })
    }

    @Test @MainActor func reviewMovesARegularNoteButNeverAnEcho() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        let regularNote = ModelFactories.note(
            body: "This regular note can be reviewed",
            echoEnabled: false,
            existingNotes: [],
            id: "regular-reviewable-note"
        )
        var echo = ModelFactories.note(
            body: "This Echo cannot be reviewed",
            echoEnabled: true,
            existingNotes: [],
            id: "echo-never-reviewed"
        )
        echo.echo.nextDueAt = ISO8601DateFormatter.echo.string(
            from: Date.now.addingTimeInterval(-60)
        )
        echo.echo.state = .due
        var state = NotesState.empty
        state.recent = [regularNote, echo]
        try persistence.saveState(state)
        let store = EchoStore(persistence: persistence)

        store.markReviewed(regularNote.id)
        store.markReviewed(echo.id)

        #expect(store.state.reviewed.contains { $0.id == regularNote.id })
        #expect(store.state.recent.allSatisfy { $0.id != regularNote.id })
        let unchangedEcho = try #require(store.note(id: echo.id))
        #expect(unchangedEcho.echo.state == .due)
        #expect(unchangedEcho.echo.lastReviewedAt == nil)
        #expect(store.state.recent.contains { $0.id == echo.id })
    }

    @Test @MainActor func undoRestoresADeletedNoteToItsOriginalListPosition() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var first = ModelFactories.note(
            body: "First reviewed note",
            echoEnabled: false,
            existingNotes: [],
            id: "reviewed-first"
        )
        first.echo.state = .reviewed
        var deleted = ModelFactories.note(
            body: "Accidentally deleted note",
            echoEnabled: false,
            existingNotes: [first],
            id: "reviewed-deleted"
        )
        deleted.echo.state = .reviewed
        var last = ModelFactories.note(
            body: "Last reviewed note",
            echoEnabled: false,
            existingNotes: [first, deleted],
            id: "reviewed-last"
        )
        last.echo.state = .reviewed
        var state = NotesState.empty
        state.reviewed = [first, deleted, last]
        try persistence.saveState(state)
        let store = EchoStore(persistence: persistence)

        store.deleteNote(deleted.id)

        #expect(store.state.reviewed.map(\.id) == [first.id, last.id])
        #expect(store.state.deletedNotes.contains { $0.id == deleted.id })
        #expect(store.pendingNoteDeletion?.message == "Note deleted")
        #expect(try persistence.loadState().reviewed.map(\.id) == [first.id, last.id])

        store.undoPendingNoteDeletion()

        #expect(store.state.reviewed.map(\.id) == [first.id, deleted.id, last.id])
        #expect(store.state.deletedNotes.allSatisfy { $0.id != deleted.id })
        #expect(store.pendingNoteDeletion == nil)
        #expect(try persistence.loadState().reviewed.map(\.id) == [first.id, deleted.id, last.id])
        #expect(try persistence.loadState().deletedNotes.allSatisfy { $0.id != deleted.id })
    }

    @Test @MainActor func deletingAnEchoOffersEchoSpecificUndo() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        let echo = ModelFactories.note(
            body: "An Echo I might delete by mistake",
            echoEnabled: true,
            existingNotes: [],
            id: "echo-delete-undo"
        )
        var state = NotesState.empty
        state.recent = [echo]
        try persistence.saveState(state)
        let store = EchoStore(persistence: persistence)

        store.deleteNote(echo.id)

        let deletionID = try #require(store.pendingNoteDeletion?.id)
        #expect(store.pendingNoteDeletion?.message == "Echo deleted")
        #expect(store.note(id: echo.id) == nil)

        store.commitPendingNoteDeletion(id: deletionID)

        #expect(store.pendingNoteDeletion == nil)
        #expect(store.state.deletedNotes.contains { $0.id == echo.id })
        #expect(try persistence.loadState().deletedNotes.contains { $0.id == echo.id })
    }

    @Test @MainActor func categoryEditsRenameExistingNoteAssignments() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var note = ModelFactories.note(
            body: "Read the motion design paper",
            echoEnabled: false,
            existingNotes: [],
            id: "note-category"
        )
        note.bucket = "Research"
        note.classificationStatus = .classified
        var state = NotesState.empty
        state.recent = [note]
        state.bucketPreferences.customs = [
            BucketDraft(name: "Research", description: "Things to investigate", colorKey: "purple")
        ]
        try persistence.saveState(state)

        let store = EchoStore(persistence: persistence)
        store.updateBucket(
            at: 0,
            with: BucketDraft(name: "Learning", description: "Things to investigate", colorKey: "gold")
        )

        #expect(store.state.bucketPreferences.customs.first?.name == "Learning")
        #expect(store.note(id: "note-category")?.bucket == "Learning")
        #expect(try persistence.loadState().recent.first?.bucket == "Learning")
    }

    @Test @MainActor func manualCategoryOverrideSurvivesLaterNoteEdits() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var note = ModelFactories.note(
            body: "A thought I want to recategorize",
            echoEnabled: false,
            existingNotes: [],
            id: "manual-category-note"
        )
        note.bucket = "Work"
        note.classificationStatus = .classified
        note.classificationMethod = .ai
        note.classificationConfidence = 0.72
        var state = NotesState.empty
        state.recent = [note]
        state.bucketPreferences.customs = [
            BucketDraft(name: "Work", description: "Tasks and projects", colorKey: "mint"),
            BucketDraft(name: "Reflections", description: "Personal thoughts", colorKey: "purple"),
        ]
        try persistence.saveState(state)
        let store = EchoStore(persistence: persistence)

        store.overrideCategory(noteID: note.id, bucketName: "Reflections")
        store.updateNote(id: note.id, body: "An edited thought that should stay put")

        #expect(store.note(id: note.id)?.bucket == "Reflections")
        #expect(store.note(id: note.id)?.classificationStatus == .classified)
        #expect(store.note(id: note.id)?.classificationMethod == .manual)
        #expect(store.note(id: note.id)?.classificationConfidence == nil)
        #expect(try persistence.loadState().recent.first?.classificationMethod == .manual)
    }

    @Test @MainActor func turningACategorizedNoteIntoAnEchoRemovesItsCategory() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var note = ModelFactories.note(
            body: "An idea that should come back later",
            echoEnabled: false,
            existingNotes: [],
            id: "categorized-echo"
        )
        note.bucket = "Ideas"
        note.classificationStatus = .classified
        note.classificationMethod = .manual
        var state = NotesState.empty
        state.recent = [note]
        state.bucketPreferences.customs = [
            BucketDraft(name: "Ideas", description: "Things I might build", colorKey: "mint")
        ]
        try persistence.saveState(state)
        let store = EchoStore(persistence: persistence)

        store.updateNote(id: note.id, body: note.body, echoEnabled: true)

        #expect(store.note(id: note.id)?.echo.enabled == true)
        #expect(store.note(id: note.id)?.bucket == nil)
        #expect(store.note(id: note.id)?.classificationMethod == .unknown)
        #expect(try persistence.loadState().recent.first?.bucket == nil)
    }

    @Test @MainActor func anEchoRejectsManualCategoryOverrides() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var state = NotesState.empty
        let note = ModelFactories.note(
            body: "Keep this uncategorized",
            echoEnabled: true,
            existingNotes: [],
            id: "uncategorized-echo"
        )
        state.recent = [note]
        state.bucketPreferences.customs = [
            BucketDraft(name: "Ideas", description: "Things I might build", colorKey: "mint")
        ]
        try persistence.saveState(state)
        let store = EchoStore(persistence: persistence)

        store.overrideCategory(noteID: note.id, bucketName: "Ideas")

        #expect(store.note(id: note.id)?.bucket == nil)
        #expect(try persistence.loadState().recent.first?.bucket == nil)
    }

    @Test @MainActor func launchRemovesALegacyCategoryFromAnEcho() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var note = ModelFactories.note(
            body: "An old categorized Echo",
            echoEnabled: true,
            existingNotes: [],
            id: "legacy-categorized-echo"
        )
        note.bucket = "Ideas"
        note.classificationMethod = .manual
        var state = NotesState.empty
        state.recent = [note]
        try persistence.saveState(state)

        let store = EchoStore(persistence: persistence)

        #expect(store.note(id: note.id)?.bucket == nil)
        #expect(store.note(id: note.id)?.classificationMethod == .unknown)
    }

    @Test func manualCategoryOverrideWinsAgainstANewerSyncedAIResult() {
        var manualNote = ModelFactories.note(
            body: "Keep the human category",
            echoEnabled: false,
            existingNotes: [],
            id: "manual-sync-note"
        )
        manualNote.updatedAt = "2026-08-21T16:00:00.000Z"
        manualNote.bucket = "Reflections"
        manualNote.classificationStatus = .classified
        manualNote.classificationMethod = .manual

        var aiNote = manualNote
        aiNote.updatedAt = "2026-08-21T17:00:00.000Z"
        aiNote.bucket = "Work"
        aiNote.classificationMethod = .ai
        aiNote.classificationConfidence = 0.91

        var local = NotesState.empty
        local.recent = [manualNote]
        let response = SyncResponseBody(
            notes: [aiNote],
            checkIns: nil,
            deletedNotes: nil,
            bucketPreferences: nil,
            standingMessages: nil,
            weeklyReviews: nil,
            weeklyReviewPreferences: nil,
            dailyCheckInPreferences: nil,
            syncedAt: nil,
            summary: nil
        )

        let merged = SyncMerger.merge(local: local, response: response)

        #expect(merged.recent.first?.bucket == "Reflections")
        #expect(merged.recent.first?.classificationMethod == .manual)
    }

    @Test func syncedEchoesCannotRegainALegacyCategory() {
        var echo = ModelFactories.note(
            body: "A synced Echo from an older client",
            echoEnabled: true,
            existingNotes: [],
            id: "synced-categorized-echo"
        )
        echo.bucket = "Ideas"
        echo.classificationStatus = .classified
        echo.classificationMethod = .manual

        let response = SyncResponseBody(
            notes: [echo],
            checkIns: nil,
            deletedNotes: nil,
            bucketPreferences: nil,
            standingMessages: nil,
            weeklyReviews: nil,
            weeklyReviewPreferences: nil,
            dailyCheckInPreferences: nil,
            syncedAt: nil,
            summary: nil
        )

        let merged = SyncMerger.merge(local: .empty, response: response)

        #expect(merged.recent.first?.bucket == nil)
        #expect(merged.recent.first?.classificationMethod == .unknown)
    }

    @Test @MainActor func unavailableCategorizationDoesNotLeaveNewNotePending() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        try persistence.saveConfig(EchoSyncConfig(
            apiBaseUrl: nil,
            apiToken: nil,
            deviceId: "test-device",
            syncEnabled: true,
            aiCategorizationEnabled: true
        ))
        let store = EchoStore(persistence: persistence)

        let noteID = try #require(store.addNote(body: "A note without a configured backend", echoEnabled: false))

        #expect(store.note(id: noteID)?.classificationStatus == .failed)
        #expect(store.note(id: noteID)?.bucket == nil)
        #expect(try persistence.loadState().recent.first?.classificationStatus == .failed)
    }

    @Test @MainActor func launchSettlesAnExistingPendingNoteWhenCategorizationIsUnavailable() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var state = NotesState.empty
        state.recent = [ModelFactories.note(
            body: "This note was interrupted while categorizing",
            echoEnabled: false,
            existingNotes: [],
            id: "note-stuck"
        )]
        try persistence.saveState(state)
        try persistence.saveConfig(EchoSyncConfig(
            apiBaseUrl: nil,
            apiToken: nil,
            deviceId: "test-device",
            syncEnabled: true,
            aiCategorizationEnabled: true
        ))
        let store = EchoStore(persistence: persistence)

        store.resumePendingClassifications()

        #expect(store.note(id: "note-stuck")?.classificationStatus == .failed)
        #expect(try persistence.loadState().recent.first?.classificationStatus == .failed)
    }

    @Test @MainActor func editingANoteRestartsItsCategorizationStateMachine() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var note = ModelFactories.note(
            body: "Original note",
            echoEnabled: false,
            existingNotes: [],
            id: "note-edited"
        )
        note.classificationStatus = .classified
        note.bucket = "Ideas"
        var state = NotesState.empty
        state.recent = [note]
        state.bucketPreferences.customs = [
            BucketDraft(name: "Ideas", description: "Things to consider", colorKey: "mint")
        ]
        try persistence.saveState(state)
        try persistence.saveConfig(EchoSyncConfig(
            apiBaseUrl: nil,
            apiToken: nil,
            deviceId: "test-device",
            syncEnabled: true,
            aiCategorizationEnabled: true
        ))
        let store = EchoStore(persistence: persistence)

        store.updateNote(id: "note-edited", body: "A completely different thought")

        #expect(store.note(id: "note-edited")?.body == "A completely different thought")
        #expect(store.note(id: "note-edited")?.bucket == nil)
        #expect(store.note(id: "note-edited")?.classificationStatus == .failed)
        #expect(store.note(id: "note-edited")?.classificationMethod == .unknown)
    }

    @Test @MainActor func launchDoesNotGuessForAnExistingFailedNoteWithoutABackend() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var note = ModelFactories.note(
            body: "Make a tiny weather app",
            echoEnabled: false,
            existingNotes: [],
            id: "note-failed"
        )
        note.classificationStatus = .failed
        var state = NotesState.empty
        state.recent = [note]
        state.bucketPreferences.customs = [
            BucketDraft(name: "Ideas", description: "Things I might build", colorKey: "mint")
        ]
        try persistence.saveState(state)
        try persistence.saveConfig(EchoSyncConfig(
            apiBaseUrl: nil,
            apiToken: nil,
            deviceId: "test-device",
            syncEnabled: true,
            aiCategorizationEnabled: true
        ))
        let store = EchoStore(persistence: persistence)

        store.resumePendingClassifications()

        #expect(store.note(id: "note-failed")?.bucket == nil)
        #expect(store.note(id: "note-failed")?.classificationStatus == .failed)
        #expect(store.note(id: "note-failed")?.classificationMethod == .unknown)
    }

    @Test @MainActor func launchClearsALegacyKeywordClassification() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var note = ModelFactories.note(
            body: "Player should get XP for crafting a thing they've never forged before",
            echoEnabled: false,
            existingNotes: [],
            id: "legacy-keyword-note"
        )
        note.bucket = "Reflections"
        note.classificationStatus = .classified
        note.classificationMethod = .keyword
        note.classificationConfidence = 0.56
        var state = NotesState.empty
        state.recent = [note]
        state.bucketPreferences.customs = [
            BucketDraft(name: "Work", description: "Tasks and professional projects", colorKey: "mint"),
            BucketDraft(name: "Reflections", description: "Personal thoughts and observations", colorKey: "purple"),
        ]
        try persistence.saveState(state)
        try persistence.saveConfig(EchoSyncConfig(
            apiBaseUrl: nil,
            apiToken: nil,
            deviceId: "test-device",
            syncEnabled: true,
            aiCategorizationEnabled: true
        ))
        let store = EchoStore(persistence: persistence)

        store.resumePendingClassifications()

        #expect(store.note(id: "legacy-keyword-note")?.bucket == nil)
        #expect(store.note(id: "legacy-keyword-note")?.classificationStatus == .failed)
        #expect(store.note(id: "legacy-keyword-note")?.classificationMethod == .unknown)
        #expect(store.note(id: "legacy-keyword-note")?.classificationConfidence == nil)
    }

    @Test @MainActor func aNoteStaysUnbucketedWithoutABackend() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var state = NotesState.empty
        state.bucketPreferences.customs = [
            BucketDraft(name: "Work", description: "Tasks and professional projects", colorKey: "mint"),
            BucketDraft(name: "Reflections", description: "Personal thoughts and observations", colorKey: "purple"),
        ]
        try persistence.saveState(state)
        try persistence.saveConfig(EchoSyncConfig(
            apiBaseUrl: nil,
            apiToken: nil,
            deviceId: "test-device",
            syncEnabled: true,
            aiCategorizationEnabled: true
        ))
        let store = EchoStore(persistence: persistence)

        let noteID = try #require(store.addNote(
            body: "Player should get XP for crafting a thing they've never forged before",
            echoEnabled: false
        ))

        #expect(store.note(id: noteID)?.bucket == nil)
        #expect(store.note(id: noteID)?.classificationStatus == .failed)
        #expect(store.note(id: noteID)?.classificationMethod == .unknown)
    }

    @Test @MainActor func aFailedAIRequestLeavesTheNoteUnbucketed() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        var state = NotesState.empty
        state.bucketPreferences.customs = [
            BucketDraft(name: "Work", description: "Tasks and professional projects", colorKey: "mint"),
            BucketDraft(name: "Reflections", description: "Personal thoughts and observations", colorKey: "purple"),
        ]
        try persistence.saveState(state)
        try persistence.saveConfig(EchoSyncConfig(
            apiBaseUrl: "https://[",
            apiToken: "test-token",
            deviceId: "test-device",
            syncEnabled: true,
            aiCategorizationEnabled: true
        ))
        let store = EchoStore(persistence: persistence)

        let noteID = try #require(store.addNote(body: "A note that needs the LLM", echoEnabled: false))
        for _ in 0..<100 where store.note(id: noteID)?.classificationStatus == .pending {
            await Task.yield()
        }

        #expect(store.note(id: noteID)?.bucket == nil)
        #expect(store.note(id: noteID)?.classificationStatus == .failed)
        #expect(store.note(id: noteID)?.classificationMethod == .unknown)
    }

    @Test func anUnreviewedEchoExpiresAfterTheDayItSurfaced() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "America/Denver"))
        let surfacedAt = try #require(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 19, hour: 9
        )))
        let laterThatDay = try #require(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 19, hour: 18
        )))
        let nextDay = try #require(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 20, hour: 9
        )))
        var note = ModelFactories.note(
            body: "This should not stay on the widget forever",
            echoEnabled: true,
            existingNotes: [],
            now: surfacedAt,
            id: "note-expired-echo"
        )
        note.echo.nextDueAt = ISO8601DateFormatter.echo.string(from: surfacedAt)
        note.echo.scheduledDates = ["2026-08-19"]
        var state = NotesState.empty
        state.recent = [note]

        let sameDayEntries = WidgetBridge.entries(from: state, now: laterThatDay)
        let nextDayEntries = WidgetBridge.entries(from: state, now: nextDay)

        #expect(sameDayEntries.contains { $0.kind == .echo })
        #expect(nextDayEntries.allSatisfy { $0.kind != .echo })
        #expect(nextDayEntries.first?.kind == .empty)

        state.standingMessages = [StandingMessage(
            id: "standing-1",
            text: "Keep going",
            createdAt: ISO8601DateFormatter.echo.string(from: surfacedAt),
            updatedAt: ISO8601DateFormatter.echo.string(from: surfacedAt)
        )]
        let entriesWithStandingMessage = WidgetBridge.entries(from: state, now: nextDay)

        #expect(entriesWithStandingMessage.allSatisfy { $0.kind != .echo })
        #expect(entriesWithStandingMessage.first?.kind == .standing)
    }

    @Test @MainActor func standingMessagesCheckInsAndWidgetPreferencesPersist() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let persistence = EchoPersistence(directory: directory)
        let store = EchoStore(persistence: persistence)

        store.upsertStandingMessage(id: nil, text: "Drink water before coffee.")
        store.addCheckIn(energy: 2, emotions: ["content"], body: "Quiet morning")
        let checkInID = try #require(store.state.checkIns.first?.id)
        store.updateCheckIn(id: checkInID, energy: 4, emotions: ["happy"], body: "Walked outside")
        store.setWidgetEnabled(false)

        let loaded = try persistence.loadState()
        #expect(loaded.standingMessages.first?.text == "Drink water before coffee.")
        #expect(loaded.checkIns.first?.energy == 4)
        #expect(loaded.checkIns.first?.emotions["happy"] == true)
        #expect(loaded.widgetPreferences.enabled == false)
        #expect(WidgetBridge.entries(from: loaded).first?.kind == .empty)
    }
}
