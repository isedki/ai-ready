import Foundation
import Observation
import ReunionsCore
import ReunionsEngine
import UIKit

/// Pilote la transcription d'une réunion (moteur partagé : ReunionsEngine.TranscriptionEngine).
/// La progression est sauvegardée après chaque tranche : une interruption ne fait rien perdre.
@MainActor @Observable
final class Transcriber {
    enum Phase: Equatable {
        case idle, loadingModel, transcribing(Double), failed(String)
    }

    private(set) var phase: Phase = .idle
    private(set) var activeMeeting: UUID?

    private var engine: TranscriptionEngine?
    private var task: Task<Void, Never>?

    func start(_ meeting: Meeting, store: MeetingStore, model: String, mode: LanguageMode, vocabulary: String, restart: Bool) {
        guard task == nil else { return }
        activeMeeting = meeting.id
        phase = .loadingModel
        task = Task {
            await run(meeting, store: store, model: model, mode: mode, vocabulary: vocabulary, restart: restart)
            task = nil
            activeMeeting = nil
        }
    }

    func cancel() { task?.cancel() }

    private func run(_ meeting: Meeting, store: MeetingStore, model: String, mode: LanguageMode, vocabulary: String, restart: Bool) async {
        // iOS suspend l'app en arrière-plan : l'écran reste allumé pendant la transcription.
        UIApplication.shared.isIdleTimerDisabled = true
        defer { UIApplication.shared.isIdleTimerDisabled = false }

        var m = meeting
        let changedSettings = m.transcriptionModel != model || m.transcriptionMode != mode
        if restart || (m.transcribedUntil > 0 && changedSettings) {
            m.segments = []
            m.transcribedUntil = 0
        }
        do {
            let engine = try await loadEngine(model)
            let url = store.audioURL(m)
            let total = m.duration > 0 ? m.duration : TranscriptionEngine.duration(ofAudioAt: url)
            guard total > 0 else { throw TranscriberError.unreadableAudio }
            m.duration = total
            m.status = .transcribing
            m.transcriptionModel = model
            m.transcriptionMode = mode
            store.save(m)
            phase = .transcribing(m.transcribedUntil / total)

            try await engine.transcribe(
                audioURL: url, duration: total, from: m.transcribedUntil, mode: mode,
                prompt: Glossary.prompt(participants: m.participants, extra: vocabulary)
            ) { chunk in
                m.segments.append(contentsOf: chunk.segments)
                m.transcribedUntil = chunk.end
                store.save(m)
                phase = .transcribing(min(1, chunk.end / total))
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
            phase = .failed(Self.message(for: error))
        }
    }

    private func loadEngine(_ model: String) async throws -> TranscriptionEngine {
        if let engine, engine.model == model { return engine }
        phase = .loadingModel
        let loaded = try await TranscriptionEngine.load(model: model)
        engine = loaded
        return loaded
    }

    private static func message(for error: Error) -> String {
        let text = error.localizedDescription
        if text.localizedCaseInsensitiveContains("internet") || text.localizedCaseInsensitiveContains("network")
            || text.localizedCaseInsensitiveContains("connexion") {
            return "Téléchargement du modèle impossible : connecte-toi en Wi-Fi puis relance. (\(text))"
        }
        return text
    }
}

enum TranscriberError: LocalizedError {
    case unreadableAudio
    var errorDescription: String? { "Fichier audio illisible ou vide." }
}
