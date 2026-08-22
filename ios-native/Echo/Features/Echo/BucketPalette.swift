import SwiftUI

enum BucketPalette {
    static let keys = [
        "mint", "sky", "purple", "orange", "teal", "pink",
        "gold", "indigo", "red", "slate", "lime", "brown",
    ]

    static func color(for key: String) -> Color {
        switch key {
        case "mint": EchoTheme.positive
        case "sky": Color(red: 0.47, green: 0.71, blue: 0.85)
        case "purple": Color(red: 0.72, green: 0.48, blue: 0.90)
        case "orange": Color(red: 0.95, green: 0.65, blue: 0.37)
        case "teal": Color(red: 0.37, green: 0.77, blue: 0.76)
        case "pink": Color(red: 0.85, green: 0.53, blue: 0.65)
        case "gold": EchoTheme.accent
        case "indigo": Color(red: 0.49, green: 0.47, blue: 0.85)
        case "red": EchoTheme.danger
        case "slate": EchoTheme.textSecondary
        case "lime": Color(red: 0.65, green: 0.75, blue: 0.45)
        case "brown": Color(red: 0.72, green: 0.58, blue: 0.45)
        default: EchoTheme.positive
        }
    }

    static func tone(for key: String) -> BucketTone {
        let color = color(for: key)
        return BucketTone(
            background: color.opacity(0.16),
            border: color.opacity(0.42),
            text: color
        )
    }
}

struct BucketTone {
    let background: Color
    let border: Color
    let text: Color

    static let neutral = BucketTone(
        background: EchoTheme.surfaceRaised,
        border: EchoTheme.border,
        text: EchoTheme.textPrimary
    )
    static let uncategorized = BucketTone(
        background: EchoTheme.surfaceRaised,
        border: EchoTheme.border,
        text: EchoTheme.textSecondary
    )
}

struct CategoryDropdown: View {
    let buckets: [BucketDraft]
    let selectedName: String?
    var placeholder = "Category"
    var includesAll = false
    var includesUnbucketed = false
    var maxTriggerWidth: CGFloat = 180
    var isEnabled = true
    let onSelect: (String) -> Void

    @State private var isPresented = false

    private var options: [CategoryDropdownOption] {
        var values: [CategoryDropdownOption] = []
        if includesAll {
            values.append(CategoryDropdownOption(value: "All", title: "All", kind: .all))
        }
        values.append(contentsOf: buckets.map {
            CategoryDropdownOption(value: $0.name, title: $0.name, kind: .bucket($0.colorKey))
        })
        if includesUnbucketed {
            values.append(CategoryDropdownOption(
                value: "Unbucketed",
                title: "Unbucketed",
                kind: .uncategorized
            ))
        }
        return values
    }

    private var selectedOption: CategoryDropdownOption? {
        options.first { $0.value == selectedName }
    }

    var body: some View {
        Button {
            isPresented.toggle()
        } label: {
            HStack(spacing: 7) {
                Circle()
                    .fill(selectedOption?.swatch ?? EchoTheme.textSecondary)
                    .frame(width: 10, height: 10)

                Text(selectedOption?.title ?? placeholder)
                    .lineLimit(1)
                    .truncationMode(.tail)

                Image(systemName: "chevron.down")
                    .font(.system(size: 10, weight: .semibold))
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(selectedOption?.tone.text ?? BucketTone.uncategorized.text)
            .padding(.horizontal, 12)
            .frame(maxWidth: maxTriggerWidth, minHeight: 40)
            .background(
                selectedOption?.tone.background ?? BucketTone.uncategorized.background,
                in: .capsule
            )
            .overlay {
                Capsule().stroke(
                    selectedOption?.tone.border ?? BucketTone.uncategorized.border,
                    lineWidth: 1
                )
            }
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled || options.isEmpty)
        .opacity(isEnabled && !options.isEmpty ? 1 : 0.5)
        .accessibilityLabel("Category")
        .accessibilityValue(selectedOption?.title ?? placeholder)
        .popover(isPresented: $isPresented, attachmentAnchor: .rect(.bounds), arrowEdge: .top) {
            ScrollView {
                LazyVStack(spacing: 4) {
                    ForEach(options) { option in
                        Button {
                            onSelect(option.value)
                            isPresented = false
                        } label: {
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(option.swatch)
                                    .frame(width: 12, height: 12)

                                Text(option.title)
                                    .lineLimit(1)

                                Spacer(minLength: 16)

                                if option.value == selectedName {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 12, weight: .semibold))
                                }
                            }
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(option.tone.text)
                            .padding(.horizontal, 12)
                            .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
                            .background(
                                option.value == selectedName ? option.tone.background : Color.clear,
                                in: .rect(cornerRadius: 12, style: .continuous)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(8)
            }
            .frame(minWidth: 220, idealWidth: 240, maxHeight: 320)
            .background(EchoTheme.surface)
            .presentationCompactAdaptation(.popover)
            .presentationBackground(EchoTheme.surface)
        }
    }
}

private struct CategoryDropdownOption: Identifiable {
    enum Kind {
        case all
        case bucket(String)
        case uncategorized
    }

    let value: String
    let title: String
    let kind: Kind

    var id: String { value }

    var tone: BucketTone {
        switch kind {
        case .all: .neutral
        case .bucket(let colorKey): BucketPalette.tone(for: colorKey)
        case .uncategorized: .uncategorized
        }
    }

    var swatch: Color {
        switch kind {
        case .all: EchoTheme.textPrimary
        case .bucket(let colorKey): BucketPalette.color(for: colorKey)
        case .uncategorized: EchoTheme.textSecondary
        }
    }
}
