import SwiftUI

@main
struct ReunionsApp: App {
    @State private var store = MeetingStore()
    @State private var recorder = Recorder()
    @State private var transcriber = Transcriber()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(store)
                .environment(recorder)
                .environment(transcriber)
        }
    }
}

/// Réglages persistés (UserDefaults via @AppStorage).
enum Settings {
    static let modelKey = "model"
    static let languageKey = "language"
    static let vocabularyKey = "vocabulary"

    /// Large v3 Turbo compressé : le modèle recommandé par Argmax sur iPhone.
    static let defaultModel = "large-v3-v20240930_626MB"
    static let models: [(id: String, label: String)] = [
        ("large-v3-v20240930_626MB", "Large v3 Turbo compressé (626 Mo, recommandé)"),
        ("large-v3-v20240930_turbo", "Large v3 Turbo complet (plus lourd)"),
    ]

    /// Amorce de vocabulaire : aide Whisper à écrire correctement les noms et sigles du projet.
    static let defaultVocabulary = "Réunion projet Phénix chez inwi avec Atos et Inetum. EB25, BSCS, OCS, SOA, APIGEE, Wallix, VABF, MGEN, CreditSet, Lagrange, Kafka. Salah, Amine, Boudriga, Badr Jbari, Faris, Saoudi, Redouane, Ghizlane."
}

enum LanguageMode: String, CaseIterable, Identifiable {
    case auto, fr, ar
    var id: String { rawValue }
    var label: String {
        switch self {
        case .auto: "Auto par tranche de 30 s (français / arabe-darija)"
        case .fr: "Français"
        case .ar: "Arabe / darija"
        }
    }
}
