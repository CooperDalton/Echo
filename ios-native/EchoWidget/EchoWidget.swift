import SwiftUI
import WidgetKit

struct EchoTimelineEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct EchoTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> EchoTimelineEntry {
        EchoTimelineEntry(
            date: .now,
            snapshot: WidgetSnapshot(entries: [], updatedAt: "")
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (EchoTimelineEntry) -> Void) {
        completion(EchoTimelineEntry(date: .now, snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<EchoTimelineEntry>) -> Void) {
        let now = Date.now
        let snapshot = loadSnapshot()
        let entry = EchoTimelineEntry(date: now, snapshot: snapshot)
        let fallbackRefresh = now.addingTimeInterval(30 * 60)
        let refresh = min(snapshot.nextVisibilityBoundary(after: now) ?? fallbackRefresh, fallbackRefresh)
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    private func loadSnapshot() -> WidgetSnapshot {
        guard
            let url = EchoSharedContainer.widgetSnapshotURL(),
            let data = try? Data(contentsOf: url),
            let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
        else {
            return WidgetSnapshot(entries: [], updatedAt: "")
        }
        return snapshot
    }
}

struct EchoWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: EchoTimelineEntry

    private let canvas = Color(red: 19 / 255, green: 14 / 255, blue: 27 / 255)
    private let border = Color(red: 67 / 255, green: 51 / 255, blue: 82 / 255)
    private let textPrimary = Color(red: 245 / 255, green: 239 / 255, blue: 249 / 255)
    private let textSecondary = Color(red: 157 / 255, green: 141 / 255, blue: 171 / 255)
    private let accent = Color(red: 255 / 255, green: 207 / 255, blue: 99 / 255)
    private let standingAccent = Color(red: 172 / 255, green: 127 / 255, blue: 202 / 255)

    private var visibleEntries: [WidgetEntryPayload] {
        Array(entry.snapshot.visibleEntries(at: entry.date).prefix(family == .systemSmall ? 1 : 3))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: rowSpacing) {
            ForEach(Array(visibleEntries.enumerated()), id: \.element.id) { index, item in
                Link(destination: URL(string: item.targetURL ?? "echo://noop")!) {
                    row(item, index: index)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(widgetPadding)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) { canvas }
    }

    private func row(_ item: WidgetEntryPayload, index: Int) -> some View {
        HStack(alignment: .top, spacing: family == .systemSmall ? 11 : 9) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(markerColor(for: item.kind))
                .frame(width: family == .systemSmall ? 4 : 3)
                .frame(maxHeight: .infinity)

            Text(item.text)
                .font(.system(size: fontSize, weight: .medium, design: .rounded))
                .foregroundStyle(item.kind == .empty ? textSecondary : textPrimary)
                .lineSpacing(family == .systemSmall ? 3 : 2)
                .lineLimit(rowLimit(index))
                .minimumScaleFactor(0.88)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 2)
        .padding(.vertical, family == .systemSmall ? 5 : 4)
        .frame(
            maxWidth: .infinity,
            maxHeight: family == .systemSmall ? .infinity : nil,
            alignment: .topLeading
        )
    }

    private func rowLimit(_ index: Int) -> Int {
        if family == .systemSmall { return 5 }
        if family == .systemLarge { return index == 0 ? 4 : 3 }
        return 2
    }

    private var fontSize: CGFloat {
        switch family {
        case .systemSmall: 16
        case .systemLarge: 15
        default: 14
        }
    }

    private var widgetPadding: CGFloat {
        family == .systemSmall ? 12 : 11
    }

    private var rowSpacing: CGFloat {
        family == .systemSmall ? 0 : 10
    }

    private func markerColor(for kind: WidgetEntryPayload.Kind) -> Color {
        switch kind {
        case .echo: accent
        case .standing: standingAccent
        case .empty: border
        }
    }
}

struct EchoHomeWidget: Widget {
    let kind = "EchoWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: EchoTimelineProvider()) { entry in
            EchoWidgetView(entry: entry)
        }
        .configurationDisplayName("Echo")
        .description("Quietly resurfaces thoughts you asked Echo to remember.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

@main
struct EchoWidgetBundle: WidgetBundle {
    var body: some Widget {
        EchoHomeWidget()
    }
}
