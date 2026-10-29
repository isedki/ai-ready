import Foundation

/// Mise en forme de la transcription pour la lecture, le partage et l'envoi à Claude.
public enum Export {
    public struct Paragraph: Identifiable, Equatable, Sendable {
        public let id: Int
        public let start: TimeInterval
        public let language: String
        public let text: String
    }

    public static func clock(_ t: TimeInterval) -> String {
        let s = Int(t.rounded())
        return String(format: "%02d:%02d:%02d", s / 3600, s % 3600 / 60, s % 60)
    }

    /// Regroupe les passages consécutifs de même langue (un changement de langue ouvre un paragraphe).
    public static func paragraphs(_ m: Meeting) -> [Paragraph] {
        var out: [Paragraph] = []
        var start: TimeInterval = 0
        var language = ""
        var lines: [String] = []
        func flush() {
            guard !lines.isEmpty else { return }
            out.append(Paragraph(id: out.count, start: start, language: language, text: lines.joined(separator: " ")))
            lines = []
        }
        for s in m.segments {
            // Nouveau paragraphe au changement de langue, ou toutes les ~2 minutes pour garder des repères.
            if s.language != language || s.start - start > 120 {
                flush()
                start = s.start
                language = s.language
            }
            lines.append(s.text)
        }
        flush()
        return out
    }

    /// Date au format français (« 29/10/2026 17:05 »), dans le fuseau du téléphone.
    public static func dateText(_ date: Date, timeZone: TimeZone = .current) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.timeZone = timeZone
        f.dateFormat = "dd/MM/yyyy HH:mm"
        return f.string(from: date)
    }

    public static func text(_ m: Meeting) -> String {
        var out = "# \(m.title)\n"
        out += "Date : \(dateText(m.date)) · Durée : \(clock(m.duration))\n"
        if let model = m.transcriptionModel {
            out += "Transcription : Whisper \(model), mode \(m.transcriptionMode?.rawValue ?? "auto")\n"
        }
        if !m.participants.isEmpty { out += "Participants : \(m.participants)\n" }
        if !m.markers.isEmpty {
            out += "\nMarqueurs posés pendant la réunion :\n"
            for mk in m.markers { out += "- [\(clock(mk.time))] \(mk.kind.rawValue)\n" }
        }
        out += "\nTranscription automatique (langue par tranche de 30 s : fr = français, ar = arabe/darija) :\n\n"
        for p in paragraphs(m) { out += "[\(clock(p.start)) · \(p.language)] \(p.text)\n\n" }
        return out
    }

    /// Texte prêt à coller dans la conversation Claude du projet.
    public static func forClaude(_ m: Meeting) -> String {
        """
        Transcription d'une réunion Phénix (darija et français, transcription automatique : noms, sigles et passages en darija peuvent être déformés).
        Prépare :
        1. le compte rendu au style Issam (contexte, décisions, actions avec porteur et date) ;
        2. les mises à jour du suivi (actions A-0xx existantes ou nouvelles) ;
        3. la liste des points incertains à vérifier.
        Corrige les noms et sigles déformés à l'aide du glossaire ci-dessous. Ne déduis rien qui ne soit pas dit ; signale les passages inaudibles ou douteux.

        Glossaire Phénix :
        \(Glossary.fullText)

        \(text(m))
        """
    }
}
