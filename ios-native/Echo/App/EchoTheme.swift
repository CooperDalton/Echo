import SwiftUI

enum EchoTheme {
    // The visual language is deliberately nocturnal: plum depth, violet layers,
    // soft lavender type, and one warm amber action color.
    static let canvas = Color(red: 19 / 255, green: 14 / 255, blue: 27 / 255)
    static let navigation = Color(red: 30 / 255, green: 23 / 255, blue: 42 / 255)
    static let surface = Color(red: 39 / 255, green: 29 / 255, blue: 52 / 255)
    static let surfaceRaised = Color(red: 47 / 255, green: 35 / 255, blue: 62 / 255)
    static let border = Color(red: 67 / 255, green: 51 / 255, blue: 82 / 255)
    static let textPrimary = Color(red: 245 / 255, green: 239 / 255, blue: 249 / 255)
    static let textSecondary = Color(red: 157 / 255, green: 141 / 255, blue: 171 / 255)
    static let accent = Color(red: 255 / 255, green: 207 / 255, blue: 99 / 255)
    static let accentMuted = Color(red: 75 / 255, green: 57 / 255, blue: 39 / 255)
    static let positive = Color(red: 119 / 255, green: 218 / 255, blue: 195 / 255)
    static let danger = Color(red: 244 / 255, green: 139 / 255, blue: 132 / 255)

    // Compatibility names keep feature code expressive while the theme evolves.
    static let warmBackground = canvas
    static let softSurface = surface
}

struct EchoCapsuleButtonStyle: ButtonStyle {
    let filled: Bool
    var minHeight: CGFloat = 44

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline.weight(.semibold))
            .foregroundStyle(filled ? EchoTheme.canvas : EchoTheme.textPrimary)
            .padding(.horizontal, 18)
            .frame(maxWidth: .infinity, minHeight: minHeight)
            .background(filled ? EchoTheme.accent : EchoTheme.surfaceRaised, in: .capsule)
            .overlay {
                if !filled {
                    Capsule().stroke(EchoTheme.border.opacity(0.8), lineWidth: 1)
                }
            }
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .opacity(configuration.isPressed ? 0.84 : 1)
            .animation(.snappy(duration: 0.18), value: configuration.isPressed)
    }
}

private struct EchoCardModifier: ViewModifier {
    let padding: CGFloat

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(EchoTheme.surface, in: .rect(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(EchoTheme.border.opacity(0.65), lineWidth: 1)
            }
    }
}

extension View {
    func echoCard(padding: CGFloat = 16) -> some View {
        modifier(EchoCardModifier(padding: padding))
    }

    func echoScreen() -> some View {
        foregroundStyle(EchoTheme.textPrimary)
            .background(EchoTheme.canvas)
    }
}
