import Foundation

struct EchoPersistence {
    static let notesFile = "echo-notes-v2.json"
    static let configFile = "echo-config-v1.json"

    let directory: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        self.encoder = encoder
        self.decoder = JSONDecoder()
    }

    func loadState() throws -> NotesState {
        let url = directory.appendingPathComponent(Self.notesFile)
        guard FileManager.default.fileExists(atPath: url.path) else { return .empty }
        return try decoder.decode(NotesState.self, from: Data(contentsOf: url))
    }

    func saveState(_ state: NotesState) throws {
        try createDirectoryIfNeeded()
        try encoder.encode(state).write(
            to: directory.appendingPathComponent(Self.notesFile),
            options: [.atomic]
        )
    }

    func loadConfig() -> EchoSyncConfig {
        let url = directory.appendingPathComponent(Self.configFile)
        guard
            FileManager.default.fileExists(atPath: url.path),
            let data = try? Data(contentsOf: url),
            let config = try? decoder.decode(EchoSyncConfig.self, from: data)
        else {
            return .fresh()
        }
        return config
    }

    func saveConfig(_ config: EchoSyncConfig) throws {
        try createDirectoryIfNeeded()
        try encoder.encode(config).write(
            to: directory.appendingPathComponent(Self.configFile),
            options: [.atomic]
        )
    }

    private func createDirectoryIfNeeded() throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }
}
