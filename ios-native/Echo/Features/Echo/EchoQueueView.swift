import SwiftUI

struct EchoQueueView: View {
    @Environment(EchoStore.self) private var store
    @State private var bucketEditor: BucketEditorRoute?
    @State private var standingEditor: StandingEditorRoute?

    private var buckets: [BucketDraft] { store.state.bucketPreferences.customs }

    private var dueToday: [EchoNote] {
        store.state.allNotes
            .filter { $0.echo.enabled && $0.bucket == nil && EchoScheduler.isDue($0.echo) }
            .sorted { nextOccurrenceDate($0) < nextOccurrenceDate($1) }
    }

    private var queue: [EchoNote] {
        store.state.allNotes
            .filter {
                $0.echo.enabled
                    && $0.bucket == nil
                    && EchoScheduler.nextOccurrence(for: $0.echo) != nil
            }
            .sorted { nextOccurrenceDate($0) < nextOccurrenceDate($1) }
    }

    private var widgetPreviewEntries: [WidgetEntryPayload] {
        var previewState = store.state
        previewState.widgetPreferences.enabled = true
        return WidgetBridge.entries(from: previewState)
    }

    var body: some View {
        @Bindable var store = store

        ZStack {
            NavigationStack(path: $store.echoPath) {
                ScrollView {
                    VStack(spacing: 24) {
                        categoriesSection
                        todaySection
                        remindersSection
                        widgetSection
                        standingMessagesSection
                        queueSection
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 28)
                }
                .background(EchoTheme.canvas.ignoresSafeArea())
                .toolbar(.hidden, for: .navigationBar)
                .navigationDestination(for: AppRoute.self) { route in
                    switch route {
                    case .note(let id): NoteDetailView(noteID: id, mode: .echo)
                    case .standing(let id): StandingMessageEditorView(messageID: id)
                    case .settings: EmptyView()
                    }
                }
            }

            if let bucketEditor {
                Color.black.opacity(0.42).ignoresSafeArea()
                    .onTapGesture { self.bucketEditor = nil }
                BucketEditorModal(index: bucketEditor.index) {
                    self.bucketEditor = nil
                }
                .padding(.horizontal, 16)
                .transition(.opacity.combined(with: .scale(scale: 0.97)))
            }
        }
        .animation(.easeOut(duration: 0.18), value: bucketEditor?.id)
        .fullScreenCover(item: $standingEditor) { route in
            StandingMessageEditorView(messageID: route.messageID)
        }
    }

    private var categoriesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Categories")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
                ForEach(Array(buckets.enumerated()), id: \.offset) { index, bucket in
                    let tone = BucketPalette.tone(for: bucket.colorKey)
                    Button {
                        bucketEditor = BucketEditorRoute(index: index)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(bucket.name)
                                .font(.system(size: 15))
                            Spacer(minLength: 0)
                            Text("\(store.state.allNotes.filter { $0.bucket == bucket.name }.count) notes")
                                .font(.system(size: 13))
                        }
                        .foregroundStyle(tone.text)
                        .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
                        .padding(14)
                        .background(tone.background, in: .rect(cornerRadius: 18, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: 18).stroke(tone.border, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                }

                Button {
                    bucketEditor = BucketEditorRoute(index: nil)
                } label: {
                    Text("+")
                        .font(.system(size: 28))
                        .foregroundStyle(EchoTheme.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 84)
                        .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 18, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 18)
                                .stroke(EchoTheme.border, style: StrokeStyle(lineWidth: 1, dash: [5]))
                        }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var todaySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Today")
            VStack(spacing: 12) {
                ForEach(dueToday) { note in
                    Button {
                        store.echoPath.append(.note(note.id))
                    } label: {
                        Text(note.body)
                            .font(.system(size: 15))
                            .foregroundStyle(EchoTheme.textPrimary)
                            .lineLimit(1)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(14)
                            .background(EchoTheme.surface, in: .rect(cornerRadius: 18, style: .continuous))
                            .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var widgetSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionTitle("Widget Preview")
                Spacer()
                onOffButton(
                    isOn: store.state.widgetPreferences.enabled,
                    action: { store.setWidgetEnabled(!store.state.widgetPreferences.enabled) }
                )
            }
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(widgetPreviewEntries.enumerated()), id: \.element.id) { index, entry in
                    Button {
                        openWidgetEntry(entry)
                    } label: {
                        Text("\(index + 1). \(entry.text)")
                            .font(.system(size: 13))
                            .foregroundStyle(entry.targetURL == nil ? EchoTheme.textSecondary : EchoTheme.textPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .disabled(entry.targetURL == nil)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 108, alignment: .topLeading)
            .padding(16)
            .background(EchoTheme.surface, in: .rect(cornerRadius: 22, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 22).stroke(EchoTheme.border, lineWidth: 1) }
        }
    }

    private var remindersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("Reminders")

            VStack(spacing: 0) {
                Text("Daily check-in")
                    .font(.system(size: 15, weight: .medium))
                    .frame(maxWidth: .infinity, alignment: .leading)
                .padding(14)

                Divider().overlay(EchoTheme.border)
                VStack(spacing: 0) {
                    ForEach(Array(store.state.dailyCheckInPreferences.times.enumerated()), id: \.element.id) {
                        index, _ in
                        HStack {
                            DatePicker(
                                "Time \(index + 1)",
                                selection: dailyTimeBinding(at: index),
                                displayedComponents: .hourAndMinute
                            )
                            .datePickerStyle(.compact)
                            .tint(EchoTheme.accent)

                            Button {
                                store.deleteDailyCheckInTime(at: index)
                            } label: {
                                Image(systemName: "minus.circle.fill")
                                    .font(.system(size: 18))
                                    .foregroundStyle(EchoTheme.textSecondary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove time \(index + 1)")
                        }
                        .padding(.horizontal, 14)
                        .frame(minHeight: 48)

                        if index < store.state.dailyCheckInPreferences.times.count - 1 {
                            Divider().overlay(EchoTheme.border).padding(.leading, 14)
                        }
                    }

                    if store.state.dailyCheckInPreferences.times.count < 5 {
                        Button {
                            store.addDailyCheckInTime()
                        } label: {
                            Text("+ Add time")
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(EchoTheme.accent)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 14)
                                .frame(height: 46)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .background(EchoTheme.surfaceRaised.opacity(0.55))
            }
            .background(EchoTheme.surface, in: .rect(cornerRadius: 18, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }
            .clipShape(.rect(cornerRadius: 18, style: .continuous))

            VStack(spacing: 0) {
                HStack {
                    Text("Weekly review")
                        .font(.system(size: 15, weight: .medium))
                    Spacer()
                    onOffButton(
                        isOn: store.state.weeklyReviewPreferences.enabled,
                        action: {
                            store.setWeeklyReviewEnabled(!store.state.weeklyReviewPreferences.enabled)
                        }
                    )
                }
                .padding(14)

                if store.state.weeklyReviewPreferences.enabled {
                    Divider().overlay(EchoTheme.border)
                    HStack(spacing: 12) {
                        Menu {
                            ForEach(Array(ReflectionScheduler.weekdayLabels.enumerated()), id: \.offset) {
                                index, label in
                                Button(label) { store.setWeeklyReviewWeekday(index + 1) }
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Text(weeklyReviewWeekday)
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 10, weight: .semibold))
                            }
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(EchoTheme.textPrimary)
                            .padding(.horizontal, 12)
                            .frame(height: 38)
                            .background(EchoTheme.surfaceRaised, in: .capsule)
                            .overlay { Capsule().stroke(EchoTheme.border, lineWidth: 1) }
                        }

                        Spacer()

                        DatePicker(
                            "Weekly review time",
                            selection: weeklyReviewTimeBinding,
                            displayedComponents: .hourAndMinute
                        )
                        .labelsHidden()
                        .datePickerStyle(.compact)
                        .tint(EchoTheme.accent)
                    }
                    .padding(14)
                    .background(EchoTheme.surfaceRaised.opacity(0.55))
                }
            }
            .background(EchoTheme.surface, in: .rect(cornerRadius: 18, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }
            .clipShape(.rect(cornerRadius: 18, style: .continuous))
        }
    }

    private var standingMessagesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionTitle("Standing Messages")
                Spacer()
                onOffButton(
                    isOn: store.state.widgetPreferences.includeStandingMessages,
                    action: {
                        store.setStandingMessagesInWidget(!store.state.widgetPreferences.includeStandingMessages)
                    }
                )
            }
            VStack(spacing: 10) {
                ForEach(store.state.standingMessages) { message in
                    SwipeDeleteCard(onDelete: { store.deleteStandingMessage(id: message.id) }) {
                        Button {
                            standingEditor = StandingEditorRoute(messageID: message.id)
                        } label: {
                            Text(message.text)
                                .font(.system(size: 14))
                                .foregroundStyle(EchoTheme.textPrimary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(13)
                                .background(EchoTheme.surface, in: .rect(cornerRadius: 14, style: .continuous))
                                .overlay { RoundedRectangle(cornerRadius: 14).stroke(EchoTheme.border, lineWidth: 1) }
                        }
                        .buttonStyle(.plain)
                    }
                }

                Button {
                    standingEditor = StandingEditorRoute(messageID: nil)
                } label: {
                    Text("+ Add message")
                        .font(.system(size: 14))
                        .foregroundStyle(EchoTheme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(13)
                        .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 14, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: 14).stroke(EchoTheme.border, lineWidth: 1) }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var queueSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                sectionTitle("Echo Queue")
                Spacer()
                Text("\(queue.count) notes")
                    .font(.system(size: 12))
                    .foregroundStyle(EchoTheme.textSecondary)
            }
            VStack(spacing: 10) {
                ForEach(queue) { note in
                    SwipeDeleteCard(onDelete: { store.deleteNote(note.id) }) {
                        Button {
                            store.echoPath.append(.note(note.id))
                        } label: {
                            HStack(spacing: 12) {
                                Text(notePreview(note))
                                    .font(.system(size: 15))
                                    .foregroundStyle(EchoTheme.textPrimary)
                                    .lineLimit(1)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Text(occurrenceLabel(for: note))
                                .font(.system(size: 12))
                                .foregroundStyle(EchoTheme.textSecondary)
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                            }
                            .frame(minHeight: 44)
                            .padding(12)
                            .background(EchoTheme.surface, in: .rect(cornerRadius: 16, style: .continuous))
                            .overlay { RoundedRectangle(cornerRadius: 16).stroke(EchoTheme.border, lineWidth: 1) }
                        }
                        .buttonStyle(.plain)
                    }
                }
                if queue.isEmpty {
                    Text("No echo notes queued.")
                        .foregroundStyle(EchoTheme.textSecondary)
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .padding(12)
                        .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 16, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 16)
                                .stroke(EchoTheme.border, style: StrokeStyle(lineWidth: 1, dash: [5]))
                        }
                }
            }
        }
    }

    private func sectionTitle(_ title: String) -> some View {
        Text(title).font(.system(size: 18, weight: .semibold))
    }

    private func onOffButton(isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(isOn ? "On" : "Off", action: action)
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(isOn ? EchoTheme.accent : EchoTheme.textPrimary)
            .padding(.horizontal, 12)
            .frame(height: 30)
            .background(isOn ? EchoTheme.accentMuted : EchoTheme.surfaceRaised, in: .capsule)
            .overlay { Capsule().stroke(EchoTheme.border, lineWidth: 1) }
    }

    private func notePreview(_ note: EchoNote) -> String {
        let compact = note.body.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return compact.isEmpty ? note.title : compact
    }

    private func nextEchoLabel(_ date: Date) -> String {
        if date <= .now { return "Due now" }
        if Calendar.current.component(.year, from: date) == Calendar.current.component(.year, from: .now) {
            return date.formatted(.dateTime.month(.abbreviated).day())
        }
        return date.formatted(.dateTime.month(.abbreviated).day().year())
    }

    private func nextOccurrenceDate(_ note: EchoNote) -> Date {
        EchoScheduler.nextOccurrence(for: note.echo)?.date ?? .distantFuture
    }

    private func occurrenceLabel(for note: EchoNote) -> String {
        guard let occurrence = EchoScheduler.nextOccurrence(for: note.echo) else {
            return "Complete"
        }
        return "\(nextEchoLabel(occurrence.date))  \(occurrence.number)/\(occurrence.total)"
    }

    private var weeklyReviewWeekday: String {
        let index = store.state.weeklyReviewPreferences.weekday - 1
        guard ReflectionScheduler.weekdayLabels.indices.contains(index) else { return "Sunday" }
        return ReflectionScheduler.weekdayLabels[index]
    }

    private var weeklyReviewTimeBinding: Binding<Date> {
        Binding(
            get: {
                date(
                    hour: store.state.weeklyReviewPreferences.hour,
                    minute: store.state.weeklyReviewPreferences.minute
                )
            },
            set: { store.setWeeklyReviewTime($0) }
        )
    }

    private func dailyTimeBinding(at index: Int) -> Binding<Date> {
        Binding(
            get: {
                guard store.state.dailyCheckInPreferences.times.indices.contains(index) else { return .now }
                let reminder = store.state.dailyCheckInPreferences.times[index]
                return date(hour: reminder.hour, minute: reminder.minute)
            },
            set: { store.updateDailyCheckInTime(at: index, date: $0) }
        )
    }

    private func date(hour: Int, minute: Int) -> Date {
        Calendar.current.date(
            bySettingHour: hour,
            minute: minute,
            second: 0,
            of: .now
        ) ?? .now
    }

    private func openWidgetEntry(_ entry: WidgetEntryPayload) {
        guard let raw = entry.targetURL, let url = URL(string: raw) else { return }
        if url.host == "note", let id = url.pathComponents.dropFirst().first {
            store.echoPath.append(.note(id.removingPercentEncoding ?? id))
        } else if url.host == "standing", let id = url.pathComponents.dropFirst().first {
            standingEditor = StandingEditorRoute(messageID: id.removingPercentEncoding ?? id)
        }
    }
}

private struct BucketEditorRoute: Identifiable {
    let index: Int?
    var id: String { index.map { "bucket-\($0)" } ?? "bucket-new" }
}

private struct StandingEditorRoute: Identifiable {
    let messageID: String?
    var id: String { messageID ?? "standing-new" }
}

private struct SwipeDeleteCard<Content: View>: View {
    let onDelete: () -> Void
    @ViewBuilder let content: Content
    @State private var offset: CGFloat = 0
    @State private var deleteFeedback = 0

    var body: some View {
        ZStack(alignment: .leading) {
            RoundedRectangle(cornerRadius: 16)
                .fill(EchoTheme.danger.opacity(0.18))
                .overlay(alignment: .leading) {
                    Text("Delete")
                        .font(.system(size: 13))
                        .foregroundStyle(EchoTheme.danger)
                        .padding(.horizontal, 22)
                }
            content
                .offset(x: offset)
                .highPriorityGesture(
                    DragGesture(minimumDistance: 18)
                        .onChanged { offset = max(0, $0.translation.width) }
                        .onEnded {
                            if $0.predictedEndTranslation.width > 110 {
                                withAnimation(.snappy) { offset = 420 }
                                deleteFeedback += 1
                                onDelete()
                            } else {
                                withAnimation(.snappy) { offset = 0 }
                            }
                        }
                )
        }
        .clipShape(.rect(cornerRadius: 16, style: .continuous))
        .sensoryFeedback(.warning, trigger: deleteFeedback)
    }
}

private struct BucketEditorModal: View {
    @Environment(EchoStore.self) private var store
    let index: Int?
    let close: () -> Void
    @State private var name = ""
    @State private var bucketDescription = ""
    @State private var colorKey = "mint"
    @State private var showingDeleteConfirmation = false

    private var existing: BucketDraft? {
        guard let index, store.state.bucketPreferences.customs.indices.contains(index) else { return nil }
        return store.state.bucketPreferences.customs[index]
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isColorUsed(colorKey)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if index == nil {
                Text("New Bucket")
                    .font(.system(size: 18, weight: .semibold))
                    .padding(.bottom, 12)
            }

            HStack(alignment: .bottom, spacing: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Name").font(.system(size: 13))
                    TextField(index == nil ? "e.g., Research" : "Bucket name", text: $name)
                        .padding(.horizontal, 12)
                        .frame(height: 44)
                        .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 12))
                        .overlay { RoundedRectangle(cornerRadius: 12).stroke(EchoTheme.border, lineWidth: 1) }
                }

                Menu {
                    ForEach(BucketPalette.keys, id: \.self) { key in
                        Button(key.capitalized) { colorKey = key }
                            .disabled(isColorUsed(key))
                    }
                } label: {
                    Circle()
                        .fill(BucketPalette.tone(for: colorKey).background)
                        .overlay { Circle().stroke(BucketPalette.tone(for: colorKey).border, lineWidth: 2) }
                        .frame(width: 20, height: 20)
                        .frame(width: 44, height: 44)
                        .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 12))
                        .overlay { RoundedRectangle(cornerRadius: 12).stroke(EchoTheme.border, lineWidth: 1) }
                }
            }

            Text("Description")
                .font(.system(size: 13))
                .padding(.top, 12)
                .padding(.bottom, 6)
            TextEditor(text: $bucketDescription)
                .font(.body)
                .foregroundStyle(EchoTheme.textPrimary)
                .scrollContentBackground(.hidden)
                .padding(8)
                .frame(height: 120)
                .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 12))
                .overlay(alignment: .topLeading) {
                    if bucketDescription.isEmpty {
                        Text("What belongs here?")
                            .foregroundStyle(EchoTheme.textSecondary)
                            .padding(.horizontal, 13)
                            .padding(.vertical, 17)
                            .allowsHitTesting(false)
                    }
                    RoundedRectangle(cornerRadius: 12).stroke(EchoTheme.border, lineWidth: 1)
                }

            HStack(spacing: 10) {
                if let index {
                    Button("Delete", role: .destructive) {
                        showingDeleteConfirmation = true
                    }
                    .foregroundStyle(EchoTheme.danger)
                    .buttonStyle(BucketModalButtonStyle(background: EchoTheme.surfaceRaised))
                    Spacer()
                    Button("Close", action: close)
                        .buttonStyle(BucketModalButtonStyle(background: EchoTheme.surfaceRaised))
                } else {
                    Spacer()
                    Button("Cancel", action: close)
                        .buttonStyle(BucketModalButtonStyle(background: EchoTheme.surfaceRaised))
                }
                Button("Save", action: save)
                    .buttonStyle(BucketModalButtonStyle(background: EchoTheme.surface))
                    .disabled(!canSave)
            }
            .padding(.top, 16)
        }
        .foregroundStyle(EchoTheme.textPrimary)
        .padding(18)
        .background(EchoTheme.surface, in: .rect(cornerRadius: 24, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 24).stroke(EchoTheme.border, lineWidth: 1) }
        .onAppear {
            guard let existing else {
                colorKey = BucketPalette.keys.first { key in
                    !store.state.bucketPreferences.customs.contains { $0.colorKey == key }
                } ?? "mint"
                return
            }
            name = existing.name
            bucketDescription = existing.description
            colorKey = existing.colorKey
        }
        .alert("Delete bucket?", isPresented: $showingDeleteConfirmation) {
            Button("Cancel", role: .cancel) {}
            Button("Delete", role: .destructive) {
                if let index { store.deleteBucket(at: index) }
                close()
            }
        } message: {
            Text("Delete \"\(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? existing?.name ?? "this bucket" : name.trimmingCharacters(in: .whitespacesAndNewlines))\"?")
        }
    }

    private func save() {
        let draft = BucketDraft(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines),
            description: bucketDescription.trimmingCharacters(in: .whitespacesAndNewlines),
            colorKey: colorKey
        )
        if let index { store.updateBucket(at: index, with: draft) }
        else { store.addBucket(draft) }
        close()
    }

    private func isColorUsed(_ key: String) -> Bool {
        store.state.bucketPreferences.customs.enumerated().contains { offset, bucket in
            if let index, offset == index { return false }
            return bucket.colorKey == key
        }
    }
}

private struct BucketModalButtonStyle: ButtonStyle {
    let background: Color
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(EchoTheme.textPrimary)
            .padding(.horizontal, 16)
            .frame(height: 42)
            .background(background, in: .rect(cornerRadius: 12))
            .overlay { RoundedRectangle(cornerRadius: 12).stroke(EchoTheme.border, lineWidth: 1) }
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct StandingMessageView: View {
    let messageID: String
    var body: some View { StandingMessageEditorView(messageID: messageID) }
}
