// reunions-cli : exécute le moteur de transcription de l'app sur un fichier audio (macOS).
//
//   reunions-cli <audio> [--model NOM] [--mode auto|fr|ar] [--participants "A, B"] [--extra "termes"] [--json sortie.json]
//
// Sert au test de bout en bout en CI : même code que l'app iPhone (ReunionsEngine + ReunionsCore).
import Foundation
import ReunionsCore
import ReunionsEngine

struct Output: Encodable {
    let model: String
    let mode: String
    let audioSeconds: Double
    let processingSeconds: Double
    let chunks: [Chunk]
    let text: String

    struct Chunk: Encodable {
        let start: Double
        let end: Double
        let language: String
        let text: String
    }
}

func value(_ flag: String, in args: [String]) -> String? {
    guard let i = args.firstIndex(of: flag), i + 1 < args.count else { return nil }
    return args[i + 1]
}

let args = Array(CommandLine.arguments.dropFirst())
guard let path = args.first, !path.hasPrefix("--") else {
    FileHandle.standardError.write(Data("usage: reunions-cli <audio> [--model NOM] [--mode auto|fr|ar] [--participants \"A, B\"] [--extra \"termes\"] [--json sortie.json]\n".utf8))
    exit(2)
}
let model = value("--model", in: args) ?? WhisperModels.default
let mode = LanguageMode(rawValue: value("--mode", in: args) ?? "auto") ?? .auto
// --no-prompt : sans amorce de vocabulaire (pour mesurer ce qu'elle apporte).
let prompt = args.contains("--no-prompt") ? "" : Glossary.prompt(participants: value("--participants", in: args) ?? "", extra: value("--extra", in: args) ?? "")
let url = URL(fileURLWithPath: path)
let duration = TranscriptionEngine.duration(ofAudioAt: url)
guard duration > 0 else {
    FileHandle.standardError.write(Data("audio illisible : \(path)\n".utf8))
    exit(1)
}

do {
    FileHandle.standardError.write(Data("Chargement du modèle \(model)…\n".utf8))
    let engine = try await TranscriptionEngine.load(model: model)
    engine.log = { FileHandle.standardError.write(Data("  · \($0)\n".utf8)) }
    let started = Date()
    var chunks: [Output.Chunk] = []
    try await engine.transcribe(audioURL: url, duration: duration, mode: mode, prompt: prompt) { chunk in
        let text = chunk.segments.map(\.text).joined(separator: " ")
        chunks.append(.init(start: chunk.start, end: chunk.end, language: chunk.language, text: text))
        print("[\(Export.clock(chunk.start))-\(Export.clock(chunk.end)) · \(chunk.language)] \(text)")
    }
    let output = Output(
        model: model, mode: mode.rawValue, audioSeconds: duration,
        processingSeconds: Date().timeIntervalSince(started), chunks: chunks,
        text: chunks.map(\.text).joined(separator: " ")
    )
    if let jsonPath = value("--json", in: args) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .withoutEscapingSlashes]
        try encoder.encode(output).write(to: URL(fileURLWithPath: jsonPath))
    }
    FileHandle.standardError.write(Data(String(format: "Audio %.0f s, traitement %.0f s\n", duration, output.processingSeconds).utf8))
} catch {
    FileHandle.standardError.write(Data("échec : \(error)\n".utf8))
    exit(1)
}
