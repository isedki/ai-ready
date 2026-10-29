import Foundation
import Observation
import UIKit
import WhisperKit

/// Transcription hors ligne sur l'iPhone avec WhisperKit (Whisper large-v3 turbo sur le Neural Engine).
///
/// Whisper ne détecte la langue qu'une fois par fichier. Pour suivre l'alternance darija / français,
/// l'audio est découpé en tranches de 30 s : chaque tranche reçoit sa propre langue (fr ou ar),
/// puis est transcrite avec cette langue et l'amorce de vocabulaire du projet.
@MainActor @Observable
final class Transcriber {
    enum Phase: Equatable {
        case idle, loadingModel, transcribing(Double), failed(String)
    }

    private(set) var phase: Phase = .idle
    private(set) var activeMeeting: UUID?

    private var pipe: WhisperKit?
    private var loadedModel: String?
    private var task: Task<Void, Never>?
    private let chunkSeconds: TimeInterval = 30

    func start(_ meeting: Meeting, store: MeetingStore, model: String, mode: LanguageMode, vocabulary: String, restart: Bool) {
        guard task == nil else { return }
        activeMeeting = meeting.id
        task = Task {
            await run(meeting, store: store, model: model, mode: mode, vocabulary: vocabulary, restart: restart)
            task = nil
            activeMeeting = nil
        }
    }

    func cancel() { task?.cancel() }

    private func run(_ meeting: Meeting, store: MeetingStore, model: String, mode: LanguageMode, vocabulary: String, restart: Bool) async {
        // L'iPhone suspend l'app en arrière-plan : on garde l'écran allumé pendant la transcription.
        UIApplication.shared.isIdleTimerDisabled = true
        defer { UIApplication.shared.isIdleTimerDisabled = false }

        var m = meeting
        if restart {
            m.segments = []
            m.transcribedUntil = 0
        }
        do {
            let pipe = try await loadModel(model)
            let url = store.audioURL(m)
            let total = m.duration > 0 ? m.duration : AudioInfo.duration(url)
            m.duration = total
            m.status = .transcribing
            store.save(m)

            let prompt = promptTokens(pipe, Glossary.prompt(participants: m.participants, extra: vocabulary))
            var start = m.transcribedUntil
            while start < total - 0.5 {
                try Task.checkCancellation()
                phase = .transcribing(total > 0 ? start / total : 0)
                let windowEnd = min(start + chunkSeconds, total)
                var samples = try AudioProcessor.loadAudioAsFloatArray(fromPath: url.path, startTime: start, endTime: windowEnd)
                var end = windowEnd
                // Couper sur un silence plutôt qu'au milieu d'un mot : les mots coupés sont la première source d'erreurs aux jointures.
                if windowEnd < total, let cut = Self.quietestCut(samples) {
                    samples = Array(samples[..<cut])
                    end = start + Double(cut) / Double(WhisperKit.sampleRate)
                }
                if !samples.isEmpty {
                    let language = try await chooseLanguage(pipe, samples, mode)
                    let options = DecodingOptions(
                        task: .transcribe,
                        language: language,
                        temperature: 0,
                        usePrefillPrompt: true,
                        detectLanguage: false,
                        skipSpecialTokens: true,
                        promptTokens: prompt
                    )
                    let results = try await pipe.transcribe(audioArray: samples, decodeOptions: options)
                    for result in results {
                        for s in result.segments {
                            var text = Self.clean(s.text)
                            guard !text.isEmpty else { continue }
                            if language == "fr" { text = Glossary.correct(text) }
                            m.segments.append(Segment(start: start + Double(s.start), end: start + Double(s.end), language: language, text: text))
                        }
                    }
                }
                start = end
                m.transcribedUntil = start
                store.save(m)       // sauvegarde à chaque tranche : rien n'est perdu si l'app est fermée
            }
            m.status = .transcribed
            store.save(m)
            phase = .idle
        } catch is CancellationError {
            m.status = .recorded
            store.save(m)
            phase = .idle
        } catch {
            m.status = .failed
            store.save(m)
            phase = .failed(error.localizedDescription)
        }
    }

    /// Premier usage : télécharge le modèle (~600 Mo, à faire en Wi-Fi), puis le garde sur l'iPhone.
    private func loadModel(_ name: String) async throws -> WhisperKit {
        if let pipe, loadedModel == name { return pipe }
        phase = .loadingModel
        let p = try await WhisperKit(WhisperKitConfig(model: name, verbose: false, prewarm: true, load: true, download: true))
        pipe = p
        loadedModel = name
        return p
    }

    /// En mode auto, on ne garde que français ou arabe : le darija est parfois détecté
    /// comme une autre langue, ce qui produirait une traduction au lieu d'une transcription.
    private func chooseLanguage(_ pipe: WhisperKit, _ samples: [Float], _ mode: LanguageMode) async throws -> String {
        switch mode {
        case .fr: return "fr"
        case .ar: return "ar"
        case .auto:
            let detection = try await pipe.detectLangauge(audioArray: samples)   // sic : nom de la méthode dans WhisperKit
            return (detection.langProbs["ar"] ?? 0) > (detection.langProbs["fr"] ?? 0) ? "ar" : "fr"
        }
    }

    private func promptTokens(_ pipe: WhisperKit, _ vocabulary: String) -> [Int]? {
        let text = vocabulary.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, let tokenizer = pipe.tokenizer else { return nil }
        let ids = tokenizer.encode(text: " " + text).filter { $0 < tokenizer.specialTokens.specialTokenBegin }
        return ids.isEmpty ? nil : Array(ids.suffix(200))   // Whisper accepte au plus ~224 jetons d'amorce
    }

    /// Point le plus calme entre 22 s et la fin de la fenêtre (trames de 0,1 s), en nombre d'échantillons.
    private static func quietestCut(_ samples: [Float]) -> Int? {
        let rate = WhisperKit.sampleRate
        let frame = rate / 10
        let from = 22 * rate
        guard samples.count > from + frame else { return nil }
        var bestEnergy = Float.greatestFiniteMagnitude
        var bestIndex = samples.count
        var i = from
        while i + frame <= samples.count {
            var energy: Float = 0
            for j in i..<(i + frame) { energy += samples[j] * samples[j] }
            if energy < bestEnergy {
                bestEnergy = energy
                bestIndex = i + frame / 2
            }
            i += frame
        }
        return bestIndex
    }

    private static func clean(_ text: String) -> String {
        text.replacingOccurrences(of: #"<\|[^|]*\|>"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
