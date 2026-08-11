import SwiftUI

struct NoteDetailView: View {
    @Environment(EchoStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    let noteID: String

    private var note: EchoNote? { store.note(id: noteID) }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Button("Back") { dismiss() }
                    .font(.body)
                    .foregroundStyle(EchoTheme.textPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(EchoTheme.surfaceRaised, in: .capsule)
                    .overlay { Capsule().stroke(EchoTheme.border, lineWidth: 1) }

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
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .foregroundStyle(EchoTheme.textPrimary)
        .background(EchoTheme.canvas.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
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
