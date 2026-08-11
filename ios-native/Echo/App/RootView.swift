import Combine
import SwiftUI

struct RootView: View {
    @Environment(EchoStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var store = store

        TabView(selection: Binding(
            get: { store.selectedTab },
            set: { tab in
                if tab == .capture { store.captureEditingNoteID = nil }
                store.selectedTab = tab
            }
        )) {
            CaptureView()
                .tabItem { Label("Capture", systemImage: "square.and.pencil") }
                .tag(EchoTab.capture)

            LibraryView()
                .tabItem { Label("Library", systemImage: "books.vertical") }
                .tag(EchoTab.library)

            EchoQueueView()
                .tabItem { Label("Echo", systemImage: "sparkles") }
                .tag(EchoTab.echo)

            CheckInView()
                .tabItem { Label("Check-in", systemImage: "heart.text.square") }
                .tag(EchoTab.checkIn)
        }
        .toolbarBackground(EchoTheme.navigation, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .background(EchoTheme.canvas)
        .onOpenURL { store.handle(url: $0) }
        .task {
            store.refreshWidget()
            await store.syncOnLaunch()
            store.refreshReminderSchedule()
            try? await Task.sleep(for: .milliseconds(250))
            store.presentDueReflectionIfNeeded()
        }
        .onChange(of: scenePhase) { _, nextPhase in
            Task {
                switch nextPhase {
                case .active:
                    store.refreshWidget()
                    await store.syncOnForeground()
                    store.refreshReminderSchedule()
                    store.presentDueReflectionIfNeeded()
                case .inactive, .background:
                    await store.syncBeforeBackground()
                @unknown default:
                    break
                }
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .echoNotificationRoute)) { notification in
            guard let route = notification.object as? String else { return }
            if route == "/checkin" || route == "/checkin-flow" {
                store.selectedTab = .checkIn
                if route == "/checkin-flow", !store.isCheckInFlowPresented {
                    store.isCheckInFlowPresented = true
                }
            } else if route == "/weekly-review" {
                store.presentWeeklyReview(source: "notification")
            }
        }
        .fullScreenCover(isPresented: $store.isCheckInFlowPresented) {
            CheckInFlowView()
        }
        .fullScreenCover(item: $store.weeklyReviewPresentation) { presentation in
            WeeklyReviewView(presentation: presentation)
        }
    }
}
