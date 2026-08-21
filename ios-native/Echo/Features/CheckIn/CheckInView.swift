import SwiftUI

private let checkInEmotions = ["happy", "content", "excited", "bliss", "anxious", "overwhelmed", "sad", "angry"]
private let emotionEmoji = [
    "happy": "🙂", "content": "😌", "excited": "🤩", "bliss": "😁",
    "anxious": "😬", "overwhelmed": "😵", "sad": "😔", "angry": "😠",
]

struct CheckInView: View {
    @Environment(EchoStore.self) private var store
    @State private var selectedCheckIn: CheckInRoute?

    var body: some View {
        VStack(spacing: 20) {
            HStack(spacing: 16) {
                Text("Recent Check-ins")
                    .font(.system(size: 18, weight: .semibold))
                Spacer()
                Button("+") { store.isCheckInFlowPresented = true }
                    .font(.system(size: 28))
                    .foregroundStyle(EchoTheme.canvas)
                    .frame(width: 44, height: 44)
                    .background(EchoTheme.accent, in: .circle)
                    .accessibilityLabel("Start new check-in")
            }

            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(store.state.checkIns.prefix(8)) { checkIn in
                        Button {
                            selectedCheckIn = CheckInRoute(id: checkIn.id)
                        } label: {
                            CheckInHistoryCard(checkIn: checkIn)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Open check-in from \(shortDate(checkIn.createdAt))")
                    }

                    if store.state.checkIns.isEmpty {
                        VStack(spacing: 6) {
                            Text("No check-ins yet.")
                            Text("Tap the plus button to start your first one.")
                                .font(.system(size: 14))
                        }
                        .foregroundStyle(EchoTheme.textSecondary)
                        .frame(maxWidth: .infinity)
                        .padding(24)
                        .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 18, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }
                    }
                }
                .padding(.bottom, 8)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 24)
        .background(EchoTheme.canvas.ignoresSafeArea())
        .fullScreenCover(item: $selectedCheckIn) { route in
            CheckInDetailModal(checkInID: route.id)
                .presentationBackground(.clear)
        }
        .sensoryFeedback(.success, trigger: store.savePulse)
    }
}

private struct CheckInRoute: Identifiable {
    let id: String
}

private struct CheckInHistoryCard: View {
    let checkIn: CheckIn

    private var primaryEmotion: String? {
        checkInEmotions.first { checkIn.emotions[$0] == true }
    }

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 8) {
                Text(primaryEmotion.flatMap { emotionEmoji[$0] } ?? "•")
                    .font(.system(size: 15))
                    .frame(width: 28, height: 28)
                    .background(emotionTone(primaryEmotion), in: .circle)

                Image(systemName: batterySymbol(checkIn.energy))
                    .font(.system(size: 18))
                    .foregroundStyle(EchoTheme.accent)
                    .frame(width: 28, height: 28)

                Text(checkIn.body.isEmpty
                     ? primaryEmotion?.capitalized ?? "Check-in"
                     : checkIn.body)
                    .font(.system(size: 14))
                    .foregroundStyle(EchoTheme.textPrimary)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            Text(shortDate(checkIn.createdAt))
                .font(.system(size: 12))
                .foregroundStyle(EchoTheme.textSecondary)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(EchoTheme.surface, in: .rect(cornerRadius: 16, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 16).stroke(EchoTheme.border, lineWidth: 1) }
    }
}

private struct CheckInDetailModal: View {
    @Environment(EchoStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let checkInID: String
    @State private var energy = 1
    @State private var selectedEmotion: String?
    @State private var bodyText = ""

    var body: some View {
        ZStack {
            Color.black.opacity(0.42).ignoresSafeArea().onTapGesture {
                saveChanges()
            }
            VStack(spacing: 18) {
                HStack(alignment: .top, spacing: 16) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Check-in details")
                            .font(.system(size: 22, weight: .semibold))
                        Text(timestamp)
                            .font(.system(size: 13))
                            .foregroundStyle(EchoTheme.textSecondary)
                    }
                    Spacer()
                }

                Menu {
                    ForEach(1...5, id: \.self) { value in
                        Button { energy = value } label: {
                            Label("\(value) / 5", systemImage: batterySymbol(value))
                        }
                    }
                } label: {
                    dropdownTrigger {
                        Image(systemName: batterySymbol(energy)).foregroundStyle(EchoTheme.accent)
                        Text("\(energy) / 5").fontWeight(.semibold)
                    }
                }

                Menu {
                    ForEach(checkInEmotions, id: \.self) { emotion in
                        Button {
                            selectedEmotion = emotion
                        } label: {
                            Text("\(emotionEmoji[emotion] ?? "•")  \(emotion.capitalized)")
                        }
                    }
                } label: {
                    dropdownTrigger {
                        Text(selectedEmotion.flatMap { emotionEmoji[$0] } ?? "•")
                        Text(selectedEmotion?.capitalized ?? "Choose emotion").fontWeight(.semibold)
                    }
                }

                ZStack(alignment: .topLeading) {
                    if bodyText.isEmpty {
                        Text("Write a few sentences about the day.")
                            .foregroundStyle(EchoTheme.textSecondary)
                            .padding(.horizontal, 19)
                            .padding(.vertical, 18)
                            .allowsHitTesting(false)
                    }
                    TextEditor(text: $bodyText)
                        .font(.system(size: 16))
                        .lineSpacing(3)
                        .foregroundStyle(EchoTheme.textPrimary)
                        .scrollContentBackground(.hidden)
                        .padding(10)
                }
                .frame(height: 330)
                .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 18, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 18)
            .background(EchoTheme.surface, in: .rect(cornerRadius: 24, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 24).stroke(EchoTheme.border, lineWidth: 1) }
            .padding(.horizontal, 16)
        }
        .onAppear {
            guard let checkIn = store.checkIn(id: checkInID) else { return }
            energy = checkIn.energy
            selectedEmotion = checkInEmotions.first { checkIn.emotions[$0] == true }
            bodyText = checkIn.body
        }
        .accessibilityAction(.escape) {
            saveChanges()
        }
    }

    private func saveChanges() {
        store.updateCheckIn(
            id: checkInID,
            energy: energy,
            emotions: selectedEmotion.map { [$0] } ?? [],
            body: bodyText
        )
        dismiss()
    }

    private var timestamp: String {
        guard let raw = store.checkIn(id: checkInID)?.createdAt,
              let date = ISO8601DateFormatter.echo.date(from: raw)
        else { return "Saved check-in" }
        return date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    }

    private func dropdownTrigger(@ViewBuilder content: () -> some View) -> some View {
        HStack(spacing: 10) {
            content()
            Spacer()
            Image(systemName: "chevron.down")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(EchoTheme.textSecondary)
        }
        .font(.system(size: 15))
        .foregroundStyle(EchoTheme.textPrimary)
        .padding(.horizontal, 14)
        .frame(minHeight: 48)
        .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 16, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 16).stroke(EchoTheme.border, lineWidth: 1) }
    }
}

struct CheckInFlowView: View {
    @Environment(EchoStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var stepIndex = 0
    @State private var energy = 1.0
    @State private var selectedEmotion: String?
    @State private var bodyText = ""
    @FocusState private var writing: Bool

    var body: some View {
        VStack(spacing: 20) {
            HStack {
                Button {
                    if stepIndex == 0 { dismiss() }
                    else { withAnimation(.snappy) { stepIndex -= 1 } }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .frame(width: 40, height: 40)
                }
                .foregroundStyle(EchoTheme.textPrimary)
                .background(EchoTheme.surfaceRaised, in: .circle)
                .overlay { Circle().stroke(EchoTheme.border, lineWidth: 1) }
                .accessibilityLabel(stepIndex == 0 ? "Close check-in" : "Previous step")
                Spacer()
                Text("\(stepIndex + 1)/3")
                    .font(.system(size: 14))
                    .foregroundStyle(EchoTheme.textSecondary)
            }

            Group {
                if stepIndex == 0 { energyStep }
                else if stepIndex == 1 { emotionsStep }
                else { writeStep }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)

            if stepIndex == 2 {
                Button("Save check-in") {
                    store.addCheckIn(
                        energy: Int(energy),
                        emotions: selectedEmotion.map { [$0] } ?? [],
                        body: bodyText
                    )
                    dismiss()
                }
                .buttonStyle(EchoCapsuleButtonStyle(filled: true, minHeight: 52))
                .frame(maxWidth: .infinity, minHeight: 52)
                .disabled(bodyText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            } else {
                Color.clear.frame(height: 60)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .foregroundStyle(EchoTheme.textPrimary)
        .background(EchoTheme.canvas.ignoresSafeArea())
    }

    private var energyStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Energy")
                .font(.system(size: 30, weight: .semibold))
            Spacer()
            HStack(spacing: 10) {
                HStack(spacing: 10) {
                    ForEach(1...5, id: \.self) { bar in
                        Capsule()
                            .fill(bar <= Int(energy) ? EchoTheme.accent : EchoTheme.border)
                            .frame(width: 28, height: 96)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
                .overlay {
                    RoundedRectangle(cornerRadius: 22)
                        .stroke(EchoTheme.accent, lineWidth: 5)
                }
                Capsule().fill(EchoTheme.accent).frame(width: 16, height: 56)
            }
            .frame(maxWidth: .infinity)
            Spacer()
            Slider(value: $energy, in: 1...5, step: 1) { editing in
                if !editing { withAnimation(.snappy) { stepIndex = 1 } }
            }
            .tint(EchoTheme.accent)
            .accessibilityLabel("Energy slider. Current energy \(Int(energy)) out of 5")
        }
    }

    private var emotionsStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Emotions")
                .font(.system(size: 30, weight: .semibold))
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
                ForEach(checkInEmotions, id: \.self) { emotion in
                    Button {
                        selectedEmotion = emotion
                        withAnimation(.snappy) { stepIndex = 2 }
                    } label: {
                        HStack(spacing: 12) {
                            Text(emotionEmoji[emotion] ?? "•").font(.system(size: 24))
                            Text(emotion.capitalized)
                                .font(.system(size: 15, weight: selectedEmotion == emotion ? .bold : .medium))
                        }
                        .foregroundStyle(selectedEmotion == emotion ? EchoTheme.accent : EchoTheme.textPrimary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 16)
                        .background(emotionTone(emotion), in: .rect(cornerRadius: 18, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(selectedEmotion == emotion ? EchoTheme.accent : EchoTheme.border, lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var writeStep: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("What did you do today?")
                .font(.system(size: 30, weight: .semibold))
            ZStack(alignment: .topLeading) {
                if bodyText.isEmpty {
                    Text("Write a few sentences about the day.")
                        .foregroundStyle(EchoTheme.textSecondary)
                        .padding(.top, 12)
                        .allowsHitTesting(false)
                }
                TextEditor(text: $bodyText)
                    .font(.system(size: 16))
                    .lineSpacing(4)
                    .foregroundStyle(EchoTheme.textPrimary)
                    .scrollContentBackground(.hidden)
                    .focused($writing)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .onAppear { writing = true }
    }
}

private func batterySymbol(_ energy: Int) -> String {
    if energy <= 1 { return "battery.25" }
    if energy == 2 { return "battery.50" }
    if energy <= 4 { return "battery.75" }
    return "battery.100"
}

private func shortDate(_ raw: String) -> String {
    guard let date = ISO8601DateFormatter.echo.date(from: raw) else { return "Saved check-in" }
    return date.formatted(.dateTime.month(.abbreviated).day())
}

private func emotionTone(_ emotion: String?) -> Color {
    switch emotion {
    case "happy": EchoTheme.accentMuted
    case "content": EchoTheme.positive.opacity(0.22)
    case "excited": EchoTheme.accent.opacity(0.20)
    case "bliss": Color.pink.opacity(0.20)
    case "anxious": Color.purple.opacity(0.23)
    case "overwhelmed": EchoTheme.danger.opacity(0.18)
    case "sad": Color.blue.opacity(0.20)
    case "angry": EchoTheme.danger.opacity(0.25)
    default: EchoTheme.surfaceRaised
    }
}
