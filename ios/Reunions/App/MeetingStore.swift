import Foundation
import Observation
import ReunionsCore
import ReunionsEngine

/// État observable des réunions, au-dessus du stockage disque (ReunionsCore.MeetingFiles).
/// Le dossier Documents est visible dans l'app Fichiers (UIFileSharingEnabled).
@Observable
final class MeetingStore {
    private(set) var meetings: [Meeting] = []
    private(set) var lastError: String?
    private let files: MeetingFiles

    init() {
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        files = MeetingFiles(root: documents.appendingPathComponent("Meetings", isDirectory: true))
        meetings = files.loadAll().map(recover)
    }

    func audioURL(_ m: Meeting) -> URL { files.audioURL(m) }
    func meeting(_ id: UUID) -> Meeting? { meetings.first { $0.id == id } }

    func save(_ m: Meeting) {
        do {
            try files.save(m)
            lastError = nil
        } catch {
            lastError = "Sauvegarde impossible : \(error.localizedDescription)"
        }
        if let i = meetings.firstIndex(where: { $0.id == m.id }) { meetings[i] = m } else { meetings.insert(m, at: 0) }
    }

    func delete(_ m: Meeting) {
        try? files.delete(m)
        meetings.removeAll { $0.id == m.id }
    }

    func newMeeting(title: String, participants: String) -> Meeting {
        files.newMeeting(title: title, participants: participants)
    }

    func importAudio(from url: URL) throws -> Meeting {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        var m = try files.importAudio(from: url)
        m.duration = TranscriptionEngine.duration(ofAudioAt: files.audioURL(m))
        save(m)
        return m
    }

    /// Remet d'aplomb une réunion après un arrêt brutal de l'app :
    /// - enregistrement interrompu : la durée est relue dans le fichier audio (format CAF, lisible même non finalisé) ;
    /// - transcription interrompue : la réunion repasse « à reprendre », sans perdre les tranches déjà faites.
    private func recover(_ meeting: Meeting) -> Meeting {
        var m = meeting
        var changed = false
        if m.duration == 0 {
            let duration = TranscriptionEngine.duration(ofAudioAt: files.audioURL(m))
            if duration > 0 {
                m.duration = duration
                changed = true
            }
        }
        if m.status == .transcribing {
            m.status = .recorded
            changed = true
        }
        if changed { try? files.save(m) }
        return m
    }
}
