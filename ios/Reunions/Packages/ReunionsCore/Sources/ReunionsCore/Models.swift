import Foundation

public struct Marker: Codable, Identifiable, Hashable, Sendable {
    public enum Kind: String, Codable, CaseIterable, Sendable {
        case decision = "Décision", action = "Action", point = "Point"
    }
    public var id: UUID
    public var time: TimeInterval
    public var kind: Kind

    public init(id: UUID = UUID(), time: TimeInterval, kind: Kind) {
        self.id = id
        self.time = time
        self.kind = kind
    }
}

/// Un passage transcrit, horodaté depuis le début de l'audio.
public struct Segment: Codable, Hashable, Sendable {
    public var start: TimeInterval
    public var end: TimeInterval
    public var language: String
    public var text: String

    public init(start: TimeInterval, end: TimeInterval, language: String, text: String) {
        self.start = start
        self.end = end
        self.language = language
        self.text = text
    }
}

public enum LanguageMode: String, CaseIterable, Identifiable, Codable, Sendable {
    case auto, fr, ar
    public var id: String { rawValue }
    public var label: String {
        switch self {
        case .auto: "Auto par tranche de 30 s (français / arabe-darija)"
        case .fr: "Français"
        case .ar: "Arabe / darija"
        }
    }
}

public struct Meeting: Codable, Identifiable, Hashable, Sendable {
    public enum Status: String, Codable, Sendable { case recorded, transcribing, transcribed, failed }

    public var id: UUID
    public var title: String
    public var date: Date
    public var participants: String
    public var duration: TimeInterval
    public var audioFile: String
    public var markers: [Marker]
    public var segments: [Segment]
    /// Fin de la dernière tranche transcrite : permet de reprendre après une interruption.
    public var transcribedUntil: TimeInterval
    public var status: Status
    /// Réglages de la dernière transcription, affichés pour savoir comment le texte a été produit.
    public var transcriptionModel: String?
    public var transcriptionMode: LanguageMode?

    public init(id: UUID = UUID(), title: String, date: Date = .now, participants: String = "", duration: TimeInterval = 0,
                audioFile: String, markers: [Marker] = [], segments: [Segment] = [], transcribedUntil: TimeInterval = 0,
                status: Status = .recorded, transcriptionModel: String? = nil, transcriptionMode: LanguageMode? = nil) {
        self.id = id
        self.title = title
        self.date = date
        self.participants = participants
        self.duration = duration
        self.audioFile = audioFile
        self.markers = markers
        self.segments = segments
        self.transcribedUntil = transcribedUntil
        self.status = status
        self.transcriptionModel = transcriptionModel
        self.transcriptionMode = transcriptionMode
    }

    /// Décodage tolérant : un champ absent ou inconnu (ancienne version de l'app) prend sa valeur par défaut
    /// au lieu de rendre la réunion illisible.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        title = (try? c.decodeIfPresent(String.self, forKey: .title)) ?? "Réunion"
        date = (try? c.decodeIfPresent(Date.self, forKey: .date)) ?? .now
        participants = (try? c.decodeIfPresent(String.self, forKey: .participants)) ?? ""
        duration = (try? c.decodeIfPresent(TimeInterval.self, forKey: .duration)) ?? 0
        audioFile = (try? c.decodeIfPresent(String.self, forKey: .audioFile)) ?? "audio.caf"
        markers = (try? c.decodeIfPresent([Marker].self, forKey: .markers)) ?? []
        segments = (try? c.decodeIfPresent([Segment].self, forKey: .segments)) ?? []
        transcribedUntil = (try? c.decodeIfPresent(TimeInterval.self, forKey: .transcribedUntil)) ?? 0
        status = (try? c.decodeIfPresent(Status.self, forKey: .status)) ?? .recorded
        transcriptionModel = try? c.decodeIfPresent(String.self, forKey: .transcriptionModel)
        transcriptionMode = try? c.decodeIfPresent(LanguageMode.self, forKey: .transcriptionMode)
    }
}

/// Modèles Whisper proposés (noms WhisperKit, sans le préfixe « openai_whisper- »).
public enum WhisperModels {
    /// Large v3 Turbo compressé : le modèle recommandé par Argmax sur iPhone.
    public static let `default` = "large-v3-v20240930_626MB"
    public static let all: [(id: String, label: String)] = [
        ("large-v3-v20240930_626MB", "Large v3 Turbo compressé (626 Mo, recommandé)"),
        ("large-v3-v20240930_turbo", "Large v3 Turbo complet (plus lourd)"),
    ]
}
