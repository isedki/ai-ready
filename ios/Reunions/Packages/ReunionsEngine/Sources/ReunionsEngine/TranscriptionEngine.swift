import AVFoundation
import Foundation
import ReunionsCore
import WhisperKit

/// Une suite de passages dans la même langue à l'intérieur d'une tranche (horodatée depuis le début de l'audio).
public struct LanguageRun: Sendable, Equatable {
    public let start: TimeInterval
    public let end: TimeInterval
    public let language: String
}

/// Résultat d'une tranche : ses suites de langue et les passages transcrits (horodatés depuis le début de l'audio).
public struct ChunkResult: Sendable {
    public let start: TimeInterval
    public let end: TimeInterval
    public let runs: [LanguageRun]
    public let segments: [Segment]
}

/// Transcription hors ligne avec WhisperKit.
///
/// Whisper ne détecte la langue qu'une fois par fichier. Pour suivre l'alternance darija / français,
/// l'audio est découpé en tranches d'environ 30 s, coupées sur un silence ; chaque tranche est redécoupée
/// en morceaux d'environ 8 s (une à deux phrases) dont on détecte la langue. Les morceaux consécutifs de même
/// langue sont transcrits ensemble, avec l'amorce de vocabulaire Phénix ; les passages en français passent
/// ensuite par les corrections du glossaire.
public final class TranscriptionEngine {
    public static let chunkSeconds: TimeInterval = 30
    /// Une tranche plus courte que ça (bruit de fin de fichier) n'est pas envoyée à Whisper.
    static let minimumChunkSeconds: TimeInterval = 0.5

    public let pipe: WhisperKit
    public let model: String
    /// Journal de diagnostic (langue détectée par tranche…) ; nil dans l'app.
    public var log: ((String) -> Void)?

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
            var runs: [LanguageRun] = []
            var segments: [Segment] = []
            if Double(samples.count) / Double(rate) >= Self.minimumChunkSeconds {
                for run in try await languageRuns(samples, mode: mode) {
                    let runStart = start + Double(run.range.lowerBound) / Double(rate)
                    let runEnd = start + Double(run.range.upperBound) / Double(rate)
                    runs.append(LanguageRun(start: runStart, end: runEnd, language: run.language))
                    let options = DecodingOptions(
                        task: .transcribe,
                        language: run.language,
                        temperature: 0,
                        usePrefillPrompt: true,
                        detectLanguage: false,
                        skipSpecialTokens: true,
                        // L'amorce est française : elle n'aide pas l'arabe et peut l'en détourner.
                        promptTokens: run.language == "fr" ? promptTokens : nil
                    )
                    let results = try await pipe.transcribe(audioArray: Array(samples[run.range]), decodeOptions: options)
                    if results.allSatisfy({ $0.segments.isEmpty }) {
                        log?("passage \(Int(runStart))-\(Int(runEnd)) s : aucun segment renvoyé (langue \(run.language))")
                    }
                    for result in results {
                        for s in result.segments {
                            var text = Self.clean(s.text)
                            guard !text.isEmpty, !Self.isHallucination(text) else { continue }
                            if run.language == "fr" { text = Glossary.correct(text) }
                            segments.append(Segment(start: runStart + Double(s.start), end: runStart + Double(s.end), language: run.language, text: text))
                        }
                    }
                }
            }
            // Garantit l'avancement même si le fichier est plus court que la durée annoncée.
            end = max(end, start + Self.minimumChunkSeconds)
            try await onChunk(ChunkResult(start: start, end: end, runs: runs, segments: segments))
            start = end
        }
    }

    /// Langue de chaque morceau (~8 s, coupé sur les silences), morceaux consécutifs de même langue fusionnés.
    /// Un morceau trop court pour une détection fiable (< 2 s) prend la langue du précédent.
    func languageRuns(_ samples: [Float], mode: LanguageMode) async throws -> [(range: Range<Int>, language: String)] {
        guard mode == .auto else { return [(0..<samples.count, mode == .ar ? "ar" : "fr")] }
        let rate = WhisperKit.sampleRate
        var labelled: [(range: Range<Int>, language: String)] = []
        for piece in AudioCut.pieces(samples, sampleRate: rate) {
            if piece.count < 2 * rate, let previous = labelled.last {
                labelled.append((piece, previous.language))
            } else {
                labelled.append((piece, try await chooseLanguage(Array(samples[piece]), mode: .auto)))
            }
        }
        return Self.mergeRuns(labelled)
    }

    static func mergeRuns(_ pieces: [(range: Range<Int>, language: String)]) -> [(range: Range<Int>, language: String)] {
        var runs: [(range: Range<Int>, language: String)] = []
        for piece in pieces {
            if let last = runs.last, last.language == piece.language, last.range.upperBound == piece.range.lowerBound {
                runs[runs.count - 1] = (last.range.lowerBound..<piece.range.upperBound, last.language)
            } else {
                runs.append(piece)
            }
        }
        return runs
    }

    /// En mode auto, seul français ou arabe est retenu : le darija est parfois détecté comme une autre langue,
    /// ce qui ferait traduire au lieu de transcrire.
    func chooseLanguage(_ samples: [Float], mode: LanguageMode) async throws -> String {
        switch mode {
        case .fr: return "fr"
        case .ar: return "ar"
        case .auto:
            let detection = try await pipe.detectLangauge(audioArray: samples)   // sic : nom de la méthode dans WhisperKit
            let choice = Self.pickLanguage(detected: detection.language, probabilities: detection.langProbs)
            if let log {
                let top = detection.langProbs.sorted { $0.value > $1.value }.prefix(3)
                    .map { "\($0.key)=\(String(format: "%.2f", $0.value))" }.joined(separator: " ")
                log("langue : détectée \(detection.language) [\(top)] → \(choice)")
            }
            return choice
        }
    }

    /// Garde la langue détectée si c'est le français ou l'arabe ; sinon (darija pris pour une autre langue,
    /// anglais sur des sigles…) compare les probabilités des deux, en tolérant les clés « <|ar|> ».
    static func pickLanguage(detected: String, probabilities: [String: Float]) -> String {
        func code(_ raw: String) -> String {
            raw.trimmingCharacters(in: CharacterSet(charactersIn: "<|>")).lowercased()
        }
        let main = code(detected)
        if main == "fr" || main == "ar" { return main }
        // WhisperKit renvoie des log-probabilités (négatives) : une langue absente vaut -∞, pas 0.
        var ar = -Float.infinity
        var fr = -Float.infinity
        for (key, p) in probabilities {
            switch code(key) {
            case "ar": ar = max(ar, p)
            case "fr": fr = max(fr, p)
            default: break
            }
        }
        return ar > fr ? "ar" : "fr"
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
