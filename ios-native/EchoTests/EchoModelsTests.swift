import Foundation
import Testing
@testable import Echo

struct EchoModelsTests {
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
        var note = ModelFactories.note(
            body: "Open me from the widget",
            echoEnabled: true,
            existingNotes: [],
            now: Date(timeIntervalSince1970: 1_786_321_200),
            id: "note-widget"
        )
        note.echo.nextDueAt = "2020-01-01T09:00:00.000Z"
        var state = NotesState.empty
        state.recent = [note]

        let entry = WidgetBridge.entries(from: state).first
        #expect(entry?.targetURL == "echo://note/note-widget")
    }

    @Test func reviewedEchoRemainsVisibleForTheDayItSurfaced() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try #require(TimeZone(identifier: "America/Los_Angeles"))
        let dueDate = try #require(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 11, hour: 9
        )))
        let reviewedAt = try #require(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 11, hour: 9, minute: 29
        )))
        let laterToday = try #require(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 11, hour: 18
        )))
        let tomorrow = try #require(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 12, hour: 9
        )))

        var note = ModelFactories.note(
            body: "Keep me visible today",
            echoEnabled: true,
            existingNotes: [],
            now: dueDate,
            id: "note-reviewed-today"
        )
        note.echo.nextDueAt = ISO8601DateFormatter.echo.string(from: dueDate)
        note.echo = EchoScheduler.review(note.echo, at: reviewedAt)
        var state = NotesState.empty
        state.reviewed = [note]

        #expect(WidgetBridge.entries(from: state, now: laterToday).first?.text == "Keep me visible today")
        #expect(WidgetBridge.entries(from: state, now: tomorrow).isEmpty)
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
