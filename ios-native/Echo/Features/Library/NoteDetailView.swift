import SwiftUI

enum NoteDetailMode {
    case library
    case echo
}

struct NoteDetailView: View {
    @Environment(EchoStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let noteID: String
    var mode: NoteDetailMode = .library
    @State private var draft = ""
    @State private var isEditing = false
    @FocusState private var editorFocused: Bool

    private var note: EchoNote? { store.note(id: noteID) }
    private var buckets: [BucketDraft] { store.state.bucketPreferences.customs }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                headerControls

                if mode == .echo {
                    echoBody
                } else {
                    libraryBody
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .foregroundStyle(EchoTheme.textPrimary)
        .background(EchoTheme.canvas.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { editorFocused = false }
            }
        }
        .onAppear {
            guard let note else { return }
            draft = note.body
            if mode == .echo, EchoScheduler.isDue(note.echo) {
                store.markReviewed(note.id)
            }
        }
        .onChange(of: editorFocused) { wasFocused, isFocused in
            guard wasFocused, !isFocused else { return }
            saveDraft()
            isEditing = false
        }
    }

    private var headerControls: some View {
        HStack(spacing: 10) {
            Button("Back") {
                saveDraft()
                dismiss()
            }
            .font(.body)
            .foregroundStyle(EchoTheme.textPrimary)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(EchoTheme.surfaceRaised, in: .capsule)
            .overlay { Capsule().stroke(EchoTheme.border, lineWidth: 1) }

            Menu {
                ForEach(buckets, id: \.name) { bucket in
                    Button {
                        store.overrideCategory(noteID: noteID, bucketName: bucket.name)
                    } label: {
                        if note?.bucket == bucket.name {
                            Label(bucket.name, systemImage: "checkmark")
                        } else {
                            Text(bucket.name)
                        }
                    }
                }
            } label: {
                HStack(spacing: 6) {
                    Image(systemName: "tag")
                    Text(note?.bucket ?? "Category")
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .semibold))
                }
                .font(.system(size: 14))
                .foregroundStyle(categoryTone.text)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: 180)
                .background(categoryTone.background, in: .capsule)
                .overlay { Capsule().stroke(categoryTone.border, lineWidth: 1) }
            }
            .disabled(note == nil || buckets.isEmpty)
            .accessibilityLabel("Override category")
        }
    }

    private var categoryTone: BucketTone {
        guard
            let bucketName = note?.bucket,
            let bucket = buckets.first(where: { $0.name == bucketName })
        else { return .uncategorized }
        return BucketPalette.tone(for: bucket.colorKey)
    }

    private func saveDraft() {
        guard let note else { return }
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != note.body else { return }
        store.updateNote(id: note.id, body: trimmed, echoEnabled: note.echo.enabled)
    }

    @ViewBuilder
    private var echoBody: some View {
        Group {
            if isEditing {
                TextEditor(text: $draft)
                    .font(.system(size: 16))
                    .lineSpacing(4)
                    .foregroundStyle(EchoTheme.textPrimary)
                    .scrollContentBackground(.hidden)
                    .focused($editorFocused)
                    .frame(minHeight: 150)
            } else {
                Text(note?.body ?? "This note is no longer available on this device.")
                    .font(.system(size: 16))
                    .lineSpacing(4)
                    .frame(maxWidth: .infinity, minHeight: 118, alignment: .topLeading)
                    .contentShape(.rect)
                    .onTapGesture {
                        guard note != nil else { return }
                        draft = note?.body ?? ""
                        isEditing = true
                        editorFocused = true
                    }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(EchoTheme.surface, in: .rect(cornerRadius: 18, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }
    }

    @ViewBuilder
    private var libraryBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(note?.title ?? "Note unavailable")
                .font(.system(.largeTitle, weight: .bold))
            Text("\(note?.bucket ?? "Unbucketed") · \(echoStatus)")
                .foregroundStyle(EchoTheme.textSecondary)
        }

        Text(note?.body ?? "This note is no longer available on this device.")
            .font(.system(size: 16))
            .lineSpacing(4)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(EchoTheme.surface, in: .rect(cornerRadius: 18, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 18).stroke(EchoTheme.border, lineWidth: 1) }

        if let note {
            HStack(spacing: 12) {
                Button("Edit") {
                    dismiss()
                    store.openNoteEditor(
                        id: note.id,
                        returnTo: note.echo.enabled ? .echo : .library
                    )
                }
                .buttonStyle(EchoCapsuleButtonStyle(filled: false, minHeight: 48))
                .frame(maxWidth: .infinity)

                if note.echo.enabled {
                    Button("Reviewed") {
                        store.markReviewed(note.id)
                        dismiss()
                    }
                    .buttonStyle(EchoCapsuleButtonStyle(filled: true, minHeight: 48))
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private var echoStatus: String {
        guard let note else { return "Not found" }
        guard note.echo.enabled else { return "Echo complete" }
        guard let date = ISO8601DateFormatter.echo.date(from: note.echo.nextDueAt) else {
            return "Echo enabled"
        }
        return "Next echo \(date.formatted(.dateTime.month(.abbreviated).day()))"
    }
}
