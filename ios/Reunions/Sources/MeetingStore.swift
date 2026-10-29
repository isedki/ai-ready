import AVFoundation
import Foundation
import Observation

struct Marker: Codable, Identifiable, Hashable {
    enum Kind: String, Codable, CaseIterable {
        case decision = "Décision", action = "Action", point = "Point"
    }
    var id = UUID()
    var time: TimeInterval
    var kind: Kind
}

/// Un passage transcrit, horodaté depuis le début de l'audio.
struct Segment: Codable, Hashable {
    var start: TimeInterval
    var end: TimeInterval
    var language: String
    var text: String
}

struct Meeting: Codable, Identifiable, Hashable {
    enum Status: String, Codable { case recorded, transcribing, transcribed, failed }

    var id = UUID()
    var title: String
    var date: Date
    var participants: String
    var duration: TimeInterval = 0
    var audioFile: String
    var markers: [Marker] = []
    var segments: [Segment] = []
    /// Fin de la dernière tranche transcrite : permet de reprendre après une interruption.
    var transcribedUntil: TimeInterval = 0
    var status: Status = .recorded
}

/// Une réunion = un dossier Documents/Meetings/<id>/ avec meeting.json et l'audio.
/// Le dossier Documents est visible dans l'app Fichiers (UIFileSharingEnabled).
@Observable
final class MeetingStore {
    private(set) var meetings: [Meeting] = []
    private let root: URL

    init() {
        root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Meetings", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        load()
    }

    func folder(_ id: UUID) -> URL { root.appendingPathComponent(id.uuidString, isDirectory: true) }
    func audioURL(_ m: Meeting) -> URL { folder(m.id).appendingPathComponent(m.audioFile) }
    func meeting(_ id: UUID) -> Meeting? { meetings.first { $0.id == id } }

    func load() {
        let dirs = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        meetings = dirs.compactMap { dir in
            guard let data = try? Data(contentsOf: dir.appendingPathComponent("meeting.json")) else { return nil }
            return try? JSONDecoder.iso.decode(Meeting.self, from: data)
        }
        .sorted { $0.date > $1.date }
    }

    func save(_ m: Meeting) {
        try? FileManager.default.createDirectory(at: folder(m.id), withIntermediateDirectories: true)
        if let data = try? JSONEncoder.iso.encode(m) {
            try? data.write(to: folder(m.id).appendingPathComponent("meeting.json"), options: .atomic)
        }
        if let i = meetings.firstIndex(where: { $0.id == m.id }) { meetings[i] = m } else { meetings.insert(m, at: 0) }
    }

    func delete(_ m: Meeting) {
        try? FileManager.default.removeItem(at: folder(m.id))
        meetings.removeAll { $0.id == m.id }
    }

    func newMeeting(title: String, participants: String, audioExtension: String = "m4a") -> Meeting {
        let m = Meeting(title: title, date: .now, participants: participants, audioFile: "audio.\(audioExtension)")
        try? FileManager.default.createDirectory(at: folder(m.id), withIntermediateDirectories: true)
        return m
    }

    /// Importe un audio existant (export Plaud, Dictaphone, WhatsApp…).
    func importAudio(from url: URL) throws -> Meeting {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let ext = url.pathExtension.isEmpty ? "m4a" : url.pathExtension.lowercased()
        var m = newMeeting(title: url.deletingPathExtension().lastPathComponent, participants: "", audioExtension: ext)
        try FileManager.default.copyItem(at: url, to: audioURL(m))
        m.duration = AudioInfo.duration(audioURL(m))
        save(m)
        return m
    }
}

enum AudioInfo {
    static func duration(_ url: URL) -> TimeInterval {
        guard let file = try? AVAudioFile(forReading: url) else { return 0 }
        return Double(file.length) / file.processingFormat.sampleRate
    }
}

extension JSONEncoder {
    static let iso: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        e.outputFormatting = [.prettyPrinted]
        return e
    }()
}

extension JSONDecoder {
    static let iso: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
