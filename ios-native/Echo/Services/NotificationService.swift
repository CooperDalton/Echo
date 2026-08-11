import Foundation
import UserNotifications

enum NotificationService {
    static func requestPermission() async throws -> Bool {
        try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound])
    }

    static func scheduleEveningCheckIn(hour: Int = 20, minute: Int = 0) async throws {
        let content = UNMutableNotificationContent()
        content.title = "Daily check-in"
        content.body = "Capture your energy, emotions, and what happened today."
        content.sound = nil
        content.userInfo = ["url": "/checkin-flow"]

        var components = DateComponents()
        components.hour = hour
        components.minute = minute
        let request = UNNotificationRequest(
            identifier: "echo-evening-checkin",
            content: content,
            trigger: UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
        )
        try await UNUserNotificationCenter.current().add(request)
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
}
