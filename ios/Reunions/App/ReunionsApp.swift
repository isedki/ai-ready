import ReunionsCore
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

/// Clés des réglages persistés (@AppStorage).
enum Settings {
    static let modelKey = "model"
    static let languageKey = "language"
    static let vocabularyKey = "vocabulary"
}
