import SwiftUI

struct CaptureView: View {
    @Environment(EchoStore.self) private var store

    var body: some View {
        CaptureEditorContent(noteID: store.captureEditingNoteID) {
            withAnimation(.snappy) {
                if store.captureEditingNoteID == nil { store.selectedTab = .library }
                else { store.closeCaptureEditor() }
            }
        }
        .id(store.captureEditingNoteID ?? "new-note")
    }
}

private struct CaptureEditorContent: View {
    @Environment(EchoStore.self) private var store
    let noteID: String?
    let close: () -> Void

    @State private var text = ""
    @FocusState private var editorFocused: Bool

    init(noteID: String? = nil, close: @escaping () -> Void) {
        self.noteID = noteID
        self.close = close
    }

    private var existingNote: EchoNote? {
        noteID.flatMap(store.note(id:))
    }

    private var submitEnabled: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Button(action: close) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 17, weight: .semibold))
                        .frame(width: 40, height: 40)
                }
                .buttonStyle(EchoRoundButtonStyle())
                .accessibilityLabel("Back to Library")

                Spacer()

                HStack(spacing: 12) {
                    if existingNote?.echo.enabled != true {
                        Button("Echo") { submit(echoEnabled: true) }
                            .buttonStyle(EchoCompactPrimaryButtonStyle())
                            .disabled(!submitEnabled)
                    }

                    Button { submit(echoEnabled: false) } label: {
                        Image(systemName: "checkmark")
                            .font(.system(size: 17, weight: .semibold))
                            .frame(width: 40, height: 40)
                    }
                    .buttonStyle(EchoRoundButtonStyle())
                    .disabled(!submitEnabled)
                    .accessibilityLabel("Save note")
                }
            }

            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text("What do you want to remember later?")
                        .font(.system(size: 16))
                        .foregroundStyle(EchoTheme.textSecondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 8)
                        .allowsHitTesting(false)
                }

                TextEditor(text: $text)
                    .font(.system(size: 16))
                    .lineSpacing(3)
                    .foregroundStyle(EchoTheme.textPrimary)
                    .scrollContentBackground(.hidden)
                    .focused($editorFocused)
                    .accessibilityIdentifier("capture.editor")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 24)
        .background(EchoTheme.canvas.ignoresSafeArea())
        .onAppear {
            text = existingNote?.body ?? ""
            editorFocused = true
        }
        .onChange(of: store.selectedTab) { _, tab in if tab != .capture { text = "" } }
        .sensoryFeedback(.success, trigger: store.savePulse)
    }

    private func submit(echoEnabled: Bool) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if let noteID {
            store.updateNote(
                id: noteID,
                body: trimmed,
                echoEnabled: echoEnabled || existingNote?.echo.enabled == true
            )
        } else {
            store.addNote(body: trimmed, echoEnabled: echoEnabled)
        }
        text = ""
        editorFocused = false
        if noteID != nil { store.closeCaptureEditor() }
        else { close() }
    }
}

private struct EchoRoundButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(EchoTheme.textPrimary)
            .background(EchoTheme.surfaceRaised, in: .circle)
            .overlay { Circle().stroke(EchoTheme.border, lineWidth: 1) }
            .opacity(configuration.isPressed ? 0.7 : 1)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}

private struct EchoCompactPrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(EchoTheme.canvas)
            .padding(.horizontal, 14)
            .frame(height: 40)
            .background(EchoTheme.accent, in: .capsule)
            .opacity(configuration.isPressed ? 0.7 : 1)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
    }
}
