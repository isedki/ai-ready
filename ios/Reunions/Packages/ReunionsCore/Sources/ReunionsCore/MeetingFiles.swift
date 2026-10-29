import Foundation

/// Stockage sur disque : un dossier par réunion (`<root>/<id>/meeting.json` + l'audio).
/// Les écritures sont atomiques : une coupure en pleine sauvegarde ne corrompt pas meeting.json.
public struct MeetingFiles: Sendable {
    public let root: URL

    public init(root: URL) {
        self.root = root
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    public func folder(_ id: UUID) -> URL { root.appendingPathComponent(id.uuidString, isDirectory: true) }
    public func audioURL(_ m: Meeting) -> URL { folder(m.id).appendingPathComponent(m.audioFile) }

    /// Toutes les réunions lisibles, de la plus récente à la plus ancienne. Un dossier illisible est ignoré.
    public func loadAll() -> [Meeting] {
        let dirs = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        return dirs.compactMap { dir in
            guard let data = try? Data(contentsOf: dir.appendingPathComponent("meeting.json")) else { return nil }
            return try? Self.decoder.decode(Meeting.self, from: data)
        }
        .sorted { $0.date > $1.date }
    }

    public func save(_ m: Meeting) throws {
        try FileManager.default.createDirectory(at: folder(m.id), withIntermediateDirectories: true)
        let data = try Self.encoder.encode(m)
        try data.write(to: folder(m.id).appendingPathComponent("meeting.json"), options: .atomic)
    }

    public func delete(_ m: Meeting) throws {
        if FileManager.default.fileExists(atPath: folder(m.id).path) {
            try FileManager.default.removeItem(at: folder(m.id))
        }
    }

    /// Crée le dossier d'une nouvelle réunion (rien n'est écrit tant que `save` n'est pas appelé).
    public func newMeeting(title: String, participants: String, audioExtension: String = "caf", date: Date = .now) -> Meeting {
        let m = Meeting(title: title, date: date, participants: participants, audioFile: "audio.\(audioExtension)")
        try? FileManager.default.createDirectory(at: folder(m.id), withIntermediateDirectories: true)
        return m
    }

    /// Copie un audio externe dans une nouvelle réunion.
    public func importAudio(from url: URL, date: Date = .now) throws -> Meeting {
        let ext = url.pathExtension.isEmpty ? "m4a" : url.pathExtension.lowercased()
        let m = newMeeting(title: url.deletingPathExtension().lastPathComponent, participants: "", audioExtension: ext, date: date)
        do {
            try FileManager.default.copyItem(at: url, to: audioURL(m))
        } catch {
            try? FileManager.default.removeItem(at: folder(m.id))
            throw error
        }
        return m
    }

    static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        return e
    }()

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
