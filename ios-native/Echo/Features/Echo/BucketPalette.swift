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
