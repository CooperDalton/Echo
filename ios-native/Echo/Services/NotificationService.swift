import Foundation
import UserNotifications

enum NotificationService {
    private static let legacyDailyIdentifier = "echo-evening-checkin"
    private static let dailyIdentifierPrefix = "echo-daily-checkin-"
    private static let weeklyIdentifier = "echo-weekly-review"

    static func requestPermission() async throws -> Bool {
        try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
    }

    static func applyReminderSchedule(
        daily: DailyCheckInPreferences,
        weekly: WeeklyReviewPreferences,
        requestPermissionIfNeeded: Bool
    ) async {
        let center = UNUserNotificationCenter.current()
        let pending = await center.pendingNotificationRequests()
        let ownedIdentifiers = pending.map(\.identifier).filter {
            $0 == legacyDailyIdentifier || $0 == weeklyIdentifier || $0.hasPrefix(dailyIdentifierPrefix)
        }
        center.removePendingNotificationRequests(withIdentifiers: ownedIdentifiers)

        guard daily.enabled || weekly.enabled else { return }
        var settings = await center.notificationSettings()
        if requestPermissionIfNeeded, settings.authorizationStatus == .notDetermined {
            _ = try? await requestPermission()
            settings = await center.notificationSettings()
        }
        guard canSchedule(settings.authorizationStatus) else { return }

        if daily.enabled {
            for reminder in Set(daily.times) where
                (0...23).contains(reminder.hour) && (0...59).contains(reminder.minute) {
                let content = UNMutableNotificationContent()
                content.title = "Daily check-in"
                content.body = "Capture your energy, emotions, and what happened today."
                content.sound = nil
                content.userInfo = ["url": "/checkin-flow"]

                var components = DateComponents()
                components.hour = reminder.hour
                components.minute = reminder.minute
                let request = UNNotificationRequest(
                    identifier: dailyIdentifierPrefix + reminder.id.replacingOccurrences(of: ":", with: ""),
                    content: content,
                    trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
                )
                try? await center.add(request)
            }
        }

        if weekly.enabled,
           (1...7).contains(weekly.weekday),
           (0...23).contains(weekly.hour),
           (0...59).contains(weekly.minute) {
            let content = UNMutableNotificationContent()
            content.title = "Weekly review"
            content.body = "Take a moment to reflect on this week and plan the next one."
            content.sound = nil
            content.userInfo = ["url": "/weekly-review"]

            var components = DateComponents()
            components.weekday = weekly.weekday
            components.hour = weekly.hour
            components.minute = weekly.minute
            let request = UNNotificationRequest(
                identifier: weeklyIdentifier,
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
            )
            try? await center.add(request)
        }
    }

    static func notifySyncFailure(_ message: String) async {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        guard settings.authorizationStatus == .authorized else { return }
        let content = UNMutableNotificationContent()
        content.title = "Sync failed"
        content.body = message
        let request = UNNotificationRequest(identifier: "echo-sync-failure", content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }

    private static func canSchedule(_ status: UNAuthorizationStatus) -> Bool {
        switch status {
        case .authorized, .provisional, .ephemeral: true
        case .notDetermined, .denied: false
        @unknown default: false
        }
    }
}
