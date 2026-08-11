import SwiftUI
import UIKit
import UserNotifications

@main
struct EchoApp: App {
    @UIApplicationDelegateAdaptor(EchoAppDelegate.self) private var appDelegate
    @State private var store = EchoStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .tint(EchoTheme.accent)
                .preferredColorScheme(.dark)
        }
    }
}

@MainActor
final class EchoAppDelegate: NSObject, UIApplicationDelegate, @preconcurrency UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        configureAppearance()
        return true
    }

    private func configureAppearance() {
        let navigationAppearance = UINavigationBarAppearance()
        navigationAppearance.configureWithOpaqueBackground()
        navigationAppearance.backgroundColor = UIColor(EchoTheme.canvas)
        navigationAppearance.shadowColor = .clear
        navigationAppearance.titleTextAttributes = [.foregroundColor: UIColor(EchoTheme.textPrimary)]
        navigationAppearance.largeTitleTextAttributes = [.foregroundColor: UIColor(EchoTheme.textPrimary)]
        UINavigationBar.appearance().standardAppearance = navigationAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navigationAppearance
        UINavigationBar.appearance().compactAppearance = navigationAppearance

        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = UIColor(EchoTheme.navigation)
        tabAppearance.shadowColor = UIColor(EchoTheme.border)
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        if let route = response.notification.request.content.userInfo["url"] as? String {
            NotificationCenter.default.post(name: .echoNotificationRoute, object: route)
        }
        completionHandler()
    }
}

extension Notification.Name {
    static let echoNotificationRoute = Notification.Name("EchoNotificationRoute")
}
