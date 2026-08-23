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
        .overlay(alignment: .bottom) {
            if let deletion = store.pendingNoteDeletion {
                NoteDeletionUndoToast(message: deletion.message) {
                    store.undoPendingNoteDeletion()
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 72)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .task(id: deletion.id) {
                    do {
                        try await Task.sleep(for: .seconds(5))
                    } catch {
                        return
                    }
                    guard !Task.isCancelled else { return }
                    store.commitPendingNoteDeletion(id: deletion.id)
                }
            }
        }
        .animation(.snappy(duration: 0.25), value: store.pendingNoteDeletion?.id)
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

private struct NoteDeletionUndoToast: View {
    let message: String
    let onUndo: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "trash")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(EchoTheme.textSecondary)

            Text(message)
                .font(.system(size: 15, weight: .semibold))

            Spacer(minLength: 8)

            Button("Undo", action: onUndo)
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(EchoTheme.accent)
                .frame(minWidth: 52, minHeight: 44)
                .buttonStyle(.plain)
                .accessibilityIdentifier("note-deletion-undo")
        }
        .foregroundStyle(EchoTheme.textPrimary)
        .padding(.leading, 16)
        .padding(.trailing, 8)
        .frame(minHeight: 56)
        .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(EchoTheme.border, lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.3), radius: 14, y: 6)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("note-deletion-toast")
    }
}
