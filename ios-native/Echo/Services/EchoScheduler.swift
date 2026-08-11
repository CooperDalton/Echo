import Foundation

enum EchoScheduler {
    private static let intervalRanges = [(4, 9), (12, 18), (30, 45), (60, 90), (120, 180)]
    private static let calendar = Calendar.current

    static func createSchedule(
        noteID: String,
        createdAt: String,
        existingNotes: [EchoNote]
    ) -> EchoSchedule {
        let seed = seedFromString(noteID)
        var occupancy = occupancyFromNotes(existingNotes, ignoredNoteID: noteID)
        let parsed = ISO8601DateFormatter.echo.date(from: createdAt) ?? .now
        var cursor = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: parsed)) ?? parsed
        var scheduledDates = [nextAvailableDate(cursor, occupancy: &occupancy)]

        for (index, range) in intervalRanges.enumerated() {
            cursor = calendar.date(
                byAdding: .day,
                value: intervalForRange(seed: seed, index: index, range: range),
                to: cursor
            ) ?? cursor
            scheduledDates.append(nextAvailableDate(cursor, occupancy: &occupancy))
        }

        return EchoSchedule(
            enabled: true,
            state: .new,
            lastReviewedAt: nil,
            nextDueAt: dueTimestamp(for: scheduledDates[0]),
            intervalDays: 1,
            ease: 2.5,
            occurrenceCount: 0,
            scheduledDates: scheduledDates
        )
    }

    static func review(_ schedule: EchoSchedule, at date: Date = .now) -> EchoSchedule {
        var result = schedule
        result.occurrenceCount = min(schedule.scheduledDates.count, max(0, schedule.occurrenceCount) + 1)
        let nextDate = result.occurrenceCount < schedule.scheduledDates.count
            ? schedule.scheduledDates[result.occurrenceCount]
            : nil
        result.enabled = nextDate != nil
        result.state = .reviewed
        result.lastReviewedAt = ISO8601DateFormatter.echo.string(from: date)
        if let nextDate {
            result.nextDueAt = dueTimestamp(for: nextDate)
        }
        return result
    }

    static func isDue(_ schedule: EchoSchedule, now: Date = .now) -> Bool {
        guard schedule.enabled else { return false }
        return (ISO8601DateFormatter.echo.date(from: schedule.nextDueAt) ?? .distantPast) <= now
    }

    private static func dateKey(_ date: Date) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year ?? 0, components.month ?? 0, components.day ?? 0)
    }

    private static func dueTimestamp(for day: String) -> String {
        let dayFormatter = DateFormatter()
        dayFormatter.locale = Locale(identifier: "en_US_POSIX")
        dayFormatter.calendar = calendar
        dayFormatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let date = dayFormatter.date(from: "\(day) 09:00:00") ?? .now
        return ISO8601DateFormatter.echo.string(from: date)
    }

    private static func seedFromString(_ value: String) -> UInt32 {
        var hash: UInt32 = 2_166_136_261
        for unit in value.utf16 {
            hash ^= UInt32(unit)
            hash = hash &* 16_777_619
        }
        return hash
    }

    private static func seededRatio(seed: UInt32, index: Int) -> Double {
        var value = seed &+ (UInt32(truncatingIfNeeded: index + 1) &* 0x9e3779b1)
        value ^= value << 13
        value ^= value >> 17
        value ^= value << 5
        return Double(value) / Double(UInt32.max)
    }

    private static func intervalForRange(seed: UInt32, index: Int, range: (Int, Int)) -> Int {
        range.0 + Int(floor(seededRatio(seed: seed, index: index) * Double(range.1 - range.0 + 1)))
    }

    private static func occupancyFromNotes(
        _ notes: [EchoNote],
        ignoredNoteID: String
    ) -> [String: Int] {
        var result: [String: Int] = [:]
        for note in notes where note.id != ignoredNoteID && note.echo.enabled && note.bucket == nil {
            for day in note.echo.scheduledDates {
                result[day, default: 0] += 1
            }
        }
        return result
    }

    private static func nextAvailableDate(_ date: Date, occupancy: inout [String: Int]) -> String {
        var candidate = calendar.startOfDay(for: date)
        while occupancy[dateKey(candidate), default: 0] >= 3 {
            candidate = calendar.date(byAdding: .day, value: 1, to: candidate) ?? candidate
        }
        let key = dateKey(candidate)
        occupancy[key, default: 0] += 1
        return key
    }
}

enum ReflectionScheduler {
    static let weekdayLabels = [
        "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ]

    static func latestWeeklyReviewOccurrence(
        preferences: WeeklyReviewPreferences,
        now: Date = .now,
        calendar: Calendar = .current
    ) -> Date? {
        guard
            preferences.enabled,
            (1...7).contains(preferences.weekday),
            (0...23).contains(preferences.hour),
            (0...59).contains(preferences.minute),
            let startsAtValue = preferences.startsAt,
            let startsAt = ISO8601DateFormatter.echo.date(from: startsAtValue),
            now >= startsAt
        else { return nil }

        var occurrence = calendar.dateComponents([.year, .month, .day], from: now)
        occurrence.hour = preferences.hour
        occurrence.minute = preferences.minute
        occurrence.second = 0
        guard var date = calendar.date(from: occurrence) else { return nil }

        let currentWeekday = calendar.component(.weekday, from: date)
        date = calendar.date(
            byAdding: .day,
            value: -((currentWeekday - preferences.weekday + 7) % 7),
            to: date
        ) ?? date
        if date > now {
            date = calendar.date(byAdding: .day, value: -7, to: date) ?? date
        }
        return date >= startsAt ? date : nil
    }

    static func pendingWeeklyReviewOccurrence(
        preferences: WeeklyReviewPreferences,
        reviews: [WeeklyReview],
        now: Date = .now,
        calendar: Calendar = .current
    ) -> Date? {
        guard let occurrence = latestWeeklyReviewOccurrence(
            preferences: preferences,
            now: now,
            calendar: calendar
        ) else { return nil }

        let alreadyCompleted = reviews.contains { review in
            guard let scheduledFor = ISO8601DateFormatter.echo.date(from: review.scheduledFor) else { return false }
            return abs(scheduledFor.timeIntervalSince(occurrence)) < 1
        }
        return alreadyCompleted ? nil : occurrence
    }

    static func previousWeeklyReview(
        reviews: [WeeklyReview],
        before occurrence: Date
    ) -> WeeklyReview? {
        reviews
            .filter { review in
                guard let scheduledFor = ISO8601DateFormatter.echo.date(from: review.scheduledFor) else { return false }
                return scheduledFor < occurrence
            }
            .max { $0.scheduledFor < $1.scheduledFor }
    }

    static func pendingDailyCheckIn(
        preferences: DailyCheckInPreferences,
        checkIns: [CheckIn],
        now: Date = .now,
        calendar: Calendar = .current
    ) -> Date? {
        guard preferences.enabled else { return nil }
        let dueTimes = preferences.times.compactMap { reminder -> Date? in
            guard (0...23).contains(reminder.hour), (0...59).contains(reminder.minute) else { return nil }
            var components = calendar.dateComponents([.year, .month, .day], from: now)
            components.hour = reminder.hour
            components.minute = reminder.minute
            components.second = 0
            guard let occurrence = calendar.date(from: components), occurrence <= now else { return nil }
            return occurrence
        }

        return dueTimes.sorted(by: >).first { occurrence in
            !checkIns.contains { checkIn in
                guard
                    checkIn.kind == .evening,
                    let createdAt = ISO8601DateFormatter.echo.date(from: checkIn.createdAt)
                else { return false }
                return createdAt >= occurrence && calendar.isDate(createdAt, inSameDayAs: occurrence)
            }
        }
    }
}
