import SwiftUI

private enum WeeklyReviewField: Hashable {
    case reflection
    case nextWeekIntent
}

private struct WeeklyReviewEditorFramesKey: PreferenceKey {
    static let defaultValue: [WeeklyReviewField: CGRect] = [:]

    static func reduce(
        value: inout [WeeklyReviewField: CGRect],
        nextValue: () -> [WeeklyReviewField: CGRect]
    ) {
        value.merge(nextValue(), uniquingKeysWith: { _, latest in latest })
    }
}

struct WeeklyReviewView: View {
    @Environment(EchoStore.self) private var store
    let presentation: WeeklyReviewPresentation
    @State private var reflection = ""
    @State private var nextWeekIntent = ""
    @State private var editorFrames: [WeeklyReviewField: CGRect] = [:]
    @FocusState private var focusedField: WeeklyReviewField?

    private var scheduledDate: Date? {
        ISO8601DateFormatter.echo.date(from: presentation.scheduledFor)
    }

    private var previousReview: WeeklyReview? {
        guard let scheduledDate else { return nil }
        return ReflectionScheduler.previousWeeklyReview(
            reviews: store.state.weeklyReviews,
            before: scheduledDate
        )
    }

    private var canSave: Bool {
        !reflection.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !nextWeekIntent.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Button {
                    store.weeklyReviewPresentation = nil
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(EchoTheme.textPrimary)
                        .frame(width: 40, height: 40)
                        .background(EchoTheme.surfaceRaised, in: .circle)
                        .overlay { Circle().stroke(EchoTheme.border, lineWidth: 1) }
                }
                .accessibilityLabel("Not now")

                VStack(spacing: 2) {
                    Text("Weekly review")
                        .font(.system(size: 18, weight: .semibold))
                    Text(reviewDateLabel)
                        .font(.system(size: 12))
                        .foregroundStyle(EchoTheme.textSecondary)
                }
                .frame(maxWidth: .infinity)

                Color.clear.frame(width: 40, height: 40)
            }
            .padding(.horizontal, 20)
            .frame(minHeight: 66)

            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    if let previousReview {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("FROM YOUR LAST REVIEW")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(EchoTheme.accent)
                            Text(previousReview.nextWeekIntent)
                                .font(.system(size: 16))
                                .lineSpacing(4)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(16)
                        .background(EchoTheme.accentMuted, in: .rect(cornerRadius: 18, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }
                    } else {
                        Text("This is your first weekly review. Next time, your plan will appear here.")
                            .foregroundStyle(EchoTheme.textSecondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(16)
                            .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 18, style: .continuous))
                            .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }
                    }

                    reviewField(
                        title: "How did this week go?",
                        placeholder: "What stood out? What worked? What didn’t?",
                        text: $reflection,
                        field: .reflection
                    )
                    reviewField(
                        title: "What do you want to do next week?",
                        placeholder: "Name the few things you want to carry forward.",
                        text: $nextWeekIntent,
                        field: .nextWeekIntent
                    )
                }
                .padding(20)
                .padding(.bottom, 16)
            }
            .scrollDismissesKeyboard(.interactively)

            HStack(spacing: 12) {
                Button("Not now") {
                    store.weeklyReviewPresentation = nil
                }
                .buttonStyle(EchoCapsuleButtonStyle(filled: false, minHeight: 48))

                Button("Save review") {
                    store.saveWeeklyReview(
                        scheduledFor: presentation.scheduledFor,
                        reflection: reflection,
                        nextWeekIntent: nextWeekIntent
                    )
                }
                .buttonStyle(EchoCapsuleButtonStyle(filled: true, minHeight: 48))
                .disabled(!canSave)
                .opacity(canSave ? 1 : 0.45)
            }
            .padding(.horizontal, 20)
            .padding(.top, 14)
            .padding(.bottom, 12)
            .overlay(alignment: .top) { Divider().overlay(EchoTheme.border) }
        }
        .foregroundStyle(EchoTheme.textPrimary)
        .background(EchoTheme.canvas.ignoresSafeArea())
        .coordinateSpace(name: "weekly-review")
        .onPreferenceChange(WeeklyReviewEditorFramesKey.self) { editorFrames = $0 }
        .simultaneousGesture(
            SpatialTapGesture(coordinateSpace: .named("weekly-review"))
                .onEnded { tap in
                    guard !editorFrames.values.contains(where: { $0.contains(tap.location) }) else { return }
                    focusedField = nil
                }
        )
    }

    private var reviewDateLabel: String {
        guard let scheduledDate else { return "Weekly review" }
        return "Week ending \(scheduledDate.formatted(.dateTime.month(.wide).day().year()))"
    }

    private func reviewField(
        title: String,
        placeholder: String,
        text: Binding<String>,
        field: WeeklyReviewField
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 17, weight: .bold))
            TextEditor(text: text)
                .focused($focusedField, equals: field)
                .font(.system(size: 16))
                .foregroundStyle(EchoTheme.textPrimary)
                .scrollContentBackground(.hidden)
                .padding(10)
                .frame(minHeight: 150)
                .background(EchoTheme.surface, in: .rect(cornerRadius: 18, style: .continuous))
                .overlay(alignment: .topLeading) {
                    if text.wrappedValue.isEmpty {
                        Text(placeholder)
                            .font(.system(size: 16))
                            .foregroundStyle(EchoTheme.textSecondary)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 19)
                            .allowsHitTesting(false)
                    }
                    RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1)
                }
                .background {
                    GeometryReader { proxy in
                        Color.clear.preference(
                            key: WeeklyReviewEditorFramesKey.self,
                            value: [field: proxy.frame(in: .named("weekly-review"))]
                        )
                    }
                }
        }
    }
}
