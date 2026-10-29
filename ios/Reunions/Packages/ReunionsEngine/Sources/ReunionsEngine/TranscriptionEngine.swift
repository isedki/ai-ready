import AVFoundation
import Foundation
import ReunionsCore
import WhisperKit

/// Résultat d'une tranche : la langue choisie et les passages transcrits (horodatés depuis le début de l'audio).
public struct ChunkResult: Sendable {
    public let start: TimeInterval
    public let end: TimeInterval
    public let language: String
    public let segments: [Segment]
}

/// Transcription hors ligne avec WhisperKit.
///
/// Whisper ne détecte la langue qu'une fois par fichier. Pour suivre l'alternance darija / français,
/// l'audio est découpé en tranches d'environ 30 s, coupées sur un silence. Chaque tranche reçoit sa langue
/// (français ou arabe), puis est transcrite avec l'amorce de vocabulaire Phénix ; les passages en français
/// passent ensuite par les corrections du glossaire.
public final class TranscriptionEngine {
    public static let chunkSeconds: TimeInterval = 30
    /// Une tranche plus courte que ça (bruit de fin de fichier) n'est pas envoyée à Whisper.
    static let minimumChunkSeconds: TimeInterval = 0.5

    public let pipe: WhisperKit
    public let model: String

    public init(pipe: WhisperKit, model: String) {
        self.pipe = pipe
        self.model = model
    }

    /// Télécharge le modèle au premier usage (~600 Mo), puis le charge depuis le disque.
    public static func load(model: String, downloadBase: URL? = nil) async throws -> TranscriptionEngine {
        let config = WhisperKitConfig(model: model, downloadBase: downloadBase, verbose: false, prewarm: true, load: true, download: true)
        return TranscriptionEngine(pipe: try await WhisperKit(config), model: model)
    }

    public static func duration(ofAudioAt url: URL) -> TimeInterval {
        guard let file = try? AVAudioFile(forReading: url) else { return 0 }
        return Double(file.length) / file.processingFormat.sampleRate
    }

    /// Transcrit de `from` à la fin. `onChunk` est appelé sur le thread principal après chaque tranche
    /// (pour sauvegarder la progression et mettre l'interface à jour) ; une erreur levée par `onChunk`
    /// ou une annulation de la tâche arrête proprement la boucle.
    public func transcribe(
        audioURL: URL,
        duration: TimeInterval,
        from: TimeInterval = 0,
        mode: LanguageMode,
        prompt: String,
        onChunk: @MainActor (ChunkResult) async throws -> Void
    ) async throws {
        let rate = WhisperKit.sampleRate
        let promptTokens = tokens(for: prompt)
        var start = max(0, from)
        while start < duration - Self.minimumChunkSeconds {
            try Task.checkCancellation()
            let windowEnd = min(start + Self.chunkSeconds, duration)
            var samples = try AudioProcessor.loadAudioAsFloatArray(fromPath: audioURL.path, startTime: start, endTime: windowEnd)
            var end = windowEnd
            if windowEnd < duration, let cut = AudioCut.quietestCut(samples, sampleRate: rate) {
                samples = Array(samples[..<cut])
                end = start + Double(cut) / Double(rate)
            }
            var language = mode == .ar ? "ar" : "fr"
            var segments: [Segment] = []
            if Double(samples.count) / Double(rate) >= Self.minimumChunkSeconds {
                language = try await chooseLanguage(samples, mode: mode)
                let options = DecodingOptions(
                    task: .transcribe,
                    language: language,
                    temperature: 0,
                    usePrefillPrompt: true,
                    detectLanguage: false,
                    skipSpecialTokens: true,
                    promptTokens: promptTokens
                )
                let results = try await pipe.transcribe(audioArray: samples, decodeOptions: options)
                for result in results {
                    for s in result.segments {
                        var text = Self.clean(s.text)
                        guard !text.isEmpty, !Self.isHallucination(text) else { continue }
                        if language == "fr" { text = Glossary.correct(text) }
                        segments.append(Segment(start: start + Double(s.start), end: start + Double(s.end), language: language, text: text))
                    }
                }
            }
            // Garantit l'avancement même si le fichier est plus court que la durée annoncée.
            end = max(end, start + Self.minimumChunkSeconds)
            try await onChunk(ChunkResult(start: start, end: end, language: language, segments: segments))
            start = end
        }
    }

    /// En mode auto, seul français ou arabe est retenu : le darija est parfois détecté comme une autre langue,
    /// ce qui ferait traduire au lieu de transcrire.
    func chooseLanguage(_ samples: [Float], mode: LanguageMode) async throws -> String {
        switch mode {
        case .fr: return "fr"
        case .ar: return "ar"
        case .auto:
            let detection = try await pipe.detectLangauge(audioArray: samples)   // sic : nom de la méthode dans WhisperKit
            return (detection.langProbs["ar"] ?? 0) > (detection.langProbs["fr"] ?? 0) ? "ar" : "fr"
        }
    }

    /// Amorce encodée, limitée aux ~200 derniers jetons (Whisper accepte au plus 224 jetons d'amorce ;
    /// Glossary.prompt met donc les informations les plus importantes à la fin).
    func tokens(for prompt: String) -> [Int]? {
        let text = prompt.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let tokenizer = pipe.tokenizer else { return nil }
        let ids = tokenizer.encode(text: " " + text).filter { $0 < tokenizer.specialTokens.specialTokenBegin }
        return ids.isEmpty ? nil : Array(ids.suffix(200))
    }

    static func clean(_ text: String) -> String {
        text.replacingOccurrences(of: #"<\|[^|]*\|>"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Phrases que Whisper invente sur du silence ou de la musique (sous-titrage de vidéos dans ses données).
    static func isHallucination(_ text: String) -> Bool {
        let t = text.lowercased()
        let known = ["sous-titrage", "sous-titres réalisés", "merci d'avoir regardé", "abonnez-vous", "amara.org",
                     "ترجمة نانسي قنقر", "اشترك في القناة"]
        return known.contains { t.contains($0) }
    }
}
