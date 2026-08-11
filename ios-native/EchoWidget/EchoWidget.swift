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
        let entry = EchoTimelineEntry(date: .now, snapshot: loadSnapshot())
        completion(Timeline(entries: [entry], policy: .after(.now.addingTimeInterval(30 * 60))))
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
    private let textPrimary = Color(red: 245 / 255, green: 239 / 255, blue: 249 / 255)

    private var visibleEntries: [WidgetEntryPayload] {
        Array(entry.snapshot.entries.prefix(family == .systemSmall ? 1 : 3))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 0 : 8) {
            ForEach(Array(visibleEntries.enumerated()), id: \.element.id) { index, item in
                Link(destination: URL(string: item.targetURL ?? "echo://noop")!) {
                    row(item, index: index)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackground(for: .widget) { canvas }
    }

    private func row(_ item: WidgetEntryPayload, index: Int) -> some View {
        Text(item.text)
            .font(.system(size: family == .systemSmall ? 15 : 14, weight: .regular))
            .foregroundStyle(textPrimary)
            .lineLimit(rowLimit(index))
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func rowLimit(_ index: Int) -> Int {
        if family == .systemSmall { return 5 }
        if family == .systemLarge { return index == 0 ? 4 : 3 }
        return 2
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
