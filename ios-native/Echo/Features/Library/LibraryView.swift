import SwiftUI

struct LibraryView: View {
    @Environment(EchoStore.self) private var store
    @State private var searchQuery = ""
    @State private var selectedBucket = "All"
    @FocusState private var searchIsFocused: Bool

    private var customBuckets: [BucketDraft] { store.state.bucketPreferences.customs }

    private var filteredRecent: [EchoNote] {
        filtered(store.state.recent.filter(isLibraryNote))
    }

    private var filteredReviewed: [EchoNote] {
        filtered(store.state.reviewed.filter(isLibraryNote))
    }

    var body: some View {
        @Bindable var store = store

        NavigationStack(path: $store.libraryPath) {
            ScrollView {
                VStack(spacing: 16) {
                    searchRow
                    VStack(spacing: 16) {
                        notesSection(title: "Recent Notes", notes: filteredRecent, reviewed: false)
                        notesSection(title: "Notes", notes: filteredReviewed, reviewed: true)
                    }
                    .contentShape(.rect)
                    .onTapGesture { searchIsFocused = false }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 28)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(EchoTheme.canvas.ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: AppRoute.self) { route in
                switch route {
                case .note(let id): NoteDetailView(noteID: id)
                case .standing(let id): StandingMessageView(messageID: id)
                case .settings: EmptyView()
                }
            }
        }
    }

    private var searchRow: some View {
        HStack(spacing: 10) {
            TextField("Search notes", text: $searchQuery)
                .font(.system(size: 15))
                .foregroundStyle(EchoTheme.textPrimary)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(.search)
                .focused($searchIsFocused)
                .onSubmit { searchIsFocused = false }
                .padding(.horizontal, 14)
                .frame(height: 40)
                .background(EchoTheme.surface, in: .rect(cornerRadius: 18, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }

            Menu {
                Button("All") {
                    selectedBucket = "All"
                    searchIsFocused = false
                }
                ForEach(customBuckets, id: \.name) { bucket in
                    Button(bucket.name) {
                        selectedBucket = bucket.name
                        searchIsFocused = false
                    }
                }
                Button("Unbucketed") {
                    selectedBucket = "Unbucketed"
                    searchIsFocused = false
                }
            } label: {
                HStack(spacing: 6) {
                    Text(selectedBucket)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                }
                .font(.system(size: 13))
                .foregroundStyle(selectedBucketTone.text)
                .padding(.horizontal, 10)
                .frame(minWidth: 72, maxWidth: 112, minHeight: 40)
                .background(selectedBucketTone.background, in: .rect(cornerRadius: 12, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 12).stroke(selectedBucketTone.border, lineWidth: 1) }
            }
        }
    }

    @ViewBuilder
    private func notesSection(title: String, notes: [EchoNote], reviewed: Bool) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.system(size: 18, weight: .semibold))

            VStack(spacing: 12) {
                ForEach(notes) { note in
                    SwipeNoteCard(
                        note: note,
                        reviewed: reviewed,
                        bucketColorKey: bucketColorKey(for: note),
                        onOpen: { store.openNoteEditor(id: note.id, returnTo: .library) },
                        onReviewed: reviewed ? nil : { store.markReviewed(note.id) },
                        onDelete: { store.deleteNote(note.id) }
                    )
                }

                if notes.isEmpty {
                    Text(reviewed
                         ? "No reviewed notes match your search."
                         : "No recent notes match your search.")
                        .font(.body)
                        .foregroundStyle(EchoTheme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(EchoTheme.surfaceRaised, in: .rect(cornerRadius: 18, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }
                }
            }
        }
    }

    private var selectedBucketTone: BucketTone {
        if selectedBucket == "All" { return .neutral }
        if selectedBucket == "Unbucketed" { return .uncategorized }
        let key = customBuckets.first { $0.name == selectedBucket }?.colorKey ?? "slate"
        return BucketPalette.tone(for: key)
    }

    private func isLibraryNote(_ note: EchoNote) -> Bool {
        !(note.echo.enabled && note.bucket == nil)
    }

    private func filtered(_ notes: [EchoNote]) -> [EchoNote] {
        notes.filter { note in
            let bucketMatches = selectedBucket == "All"
                || (selectedBucket == "Unbucketed" ? note.bucket == nil : note.bucket == selectedBucket)
            let query = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let queryMatches = query.isEmpty
                || "\(note.title) \(note.body) \(note.bucket ?? "unbucketed")".lowercased().contains(query)
            return bucketMatches && queryMatches
        }
    }

    private func bucketColorKey(for note: EchoNote) -> String? {
        guard let bucketName = note.bucket else { return nil }
        return customBuckets.first { $0.name == bucketName }?.colorKey
    }
}

private struct SwipeNoteCard: View {
    let note: EchoNote
    let reviewed: Bool
    let bucketColorKey: String?
    let onOpen: () -> Void
    let onReviewed: (() -> Void)?
    let onDelete: () -> Void
    @State private var offset: CGFloat = 0
    @State private var reviewFeedback = 0
    @State private var deleteFeedback = 0

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(offset < 0 ? EchoTheme.positive.opacity(0.22) : EchoTheme.danger.opacity(0.18))
                .overlay(alignment: offset < 0 ? .trailing : .leading) {
                    Text(offset < 0 ? "Reviewed" : "Delete")
                        .font(.system(size: 13))
                        .foregroundStyle(offset < 0 ? EchoTheme.positive : EchoTheme.danger)
                        .padding(.horizontal, 22)
                }

            Button(action: onOpen) {
                NoteCardContent(note: note, bucketColorKey: bucketColorKey)
            }
            .buttonStyle(.plain)
            .offset(x: offset)
            .highPriorityGesture(
                DragGesture(minimumDistance: 18)
                    .onChanged { value in
                        let translation = value.translation.width
                        offset = reviewed ? max(0, translation) : translation
                    }
                    .onEnded { value in
                        let final = value.predictedEndTranslation.width
                        if final > 110 {
                            withAnimation(.snappy) { offset = 420 }
                            deleteFeedback += 1
                            onDelete()
                        } else if final < -110, let onReviewed {
                            withAnimation(.snappy) { offset = -420 }
                            reviewFeedback += 1
                            onReviewed()
                        } else {
                            withAnimation(.snappy) { offset = 0 }
                        }
                    }
            )
        }
        .clipShape(.rect(cornerRadius: 18, style: .continuous))
        .sensoryFeedback(.success, trigger: reviewFeedback)
        .sensoryFeedback(.warning, trigger: deleteFeedback)
    }
}

private struct NoteCardContent: View {
    let note: EchoNote
    let bucketColorKey: String?

    private var bodyPreview: String {
        note.body.replacingOccurrences(of: "\\s*\\n+\\s*", with: " ", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var bodyOnly: Bool {
        let title = note.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return bodyPreview.count <= 32 || title.isEmpty || bodyPreview == title
    }

    var body: some View {
        VStack(alignment: .leading, spacing: bodyOnly ? 0 : 6) {
            HStack {
                Text(bodyOnly ? bodyPreview : note.title)
                    .font(.system(size: 15))
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(bucketLabel)
                    .font(.system(size: 10))
                    .foregroundStyle(bucketTone.text)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 2)
                    .background(bucketTone.background, in: .capsule)
                    .overlay { Capsule().stroke(bucketTone.border, lineWidth: 1) }
            }
            if !bodyOnly {
                Text(bodyPreview)
                    .font(.body)
                    .foregroundStyle(EchoTheme.textSecondary)
                    .lineLimit(2)
            }
        }
        .foregroundStyle(EchoTheme.textPrimary)
        .padding(14)
        .background(EchoTheme.surface, in: .rect(cornerRadius: 18, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }
    }

    private var bucketLabel: String {
        if let bucket = note.bucket { return bucket }
        if note.classificationStatus == .pending { return "Categorizing..." }
        return "Unbucketed"
    }

    private var bucketTone: BucketTone {
        bucketColorKey.map(BucketPalette.tone(for:)) ?? .uncategorized
    }
}
