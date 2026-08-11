import SwiftUI

struct StandingMessageEditorView: View {
    @Environment(EchoStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let messageID: String?

    @State private var text = ""
    @FocusState private var focused: Bool

    private var canSave: Bool {
        !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Button("Cancel") { dismiss() }
                    .font(.body)
                    .foregroundStyle(EchoTheme.textPrimary)
                    .padding(.horizontal, 14)
                    .frame(height: 40)
                    .background(EchoTheme.surfaceRaised, in: .capsule)
                    .overlay { Capsule().stroke(EchoTheme.border, lineWidth: 1) }
                Spacer()
                Button("Save") {
                    store.upsertStandingMessage(id: messageID, text: text)
                    dismiss()
                }
                .font(.body)
                .foregroundStyle(EchoTheme.canvas)
                .padding(.horizontal, 16)
                .frame(height: 40)
                .background(EchoTheme.accent, in: .capsule)
                .disabled(!canSave)
                .opacity(canSave ? 1 : 0.7)
            }

            ZStack(alignment: .topLeading) {
                if text.isEmpty {
                    Text("Standing reminder")
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
                    .focused($focused)
                    .accessibilityIdentifier("standing.editor")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .padding(.horizontal, 20)
        .padding(.top, 12)
        .padding(.bottom, 24)
        .background(EchoTheme.canvas.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .onAppear {
            text = messageID.flatMap { store.standingMessage(id: $0)?.text } ?? ""
            focused = true
        }
    }
}
