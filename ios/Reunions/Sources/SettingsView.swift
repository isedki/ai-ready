import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage(Settings.modelKey) private var model = Settings.defaultModel
    @AppStorage(Settings.languageKey) private var language = LanguageMode.auto.rawValue
    @AppStorage(Settings.vocabularyKey) private var vocabulary = Settings.defaultVocabulary

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Langue", selection: $language) {
                        ForEach(LanguageMode.allCases) { Text($0.label).tag($0.rawValue) }
                    }
                    .pickerStyle(.inline)
                } header: {
                    Text("Langue")
                } footer: {
                    Text("Auto : chaque tranche de 30 s est transcrite en français ou en arabe selon ce qui y domine. Pour une réunion presque toute en français, choisis Français : les sigles et noms seront plus propres.")
                }

                Section {
                    Picker("Modèle", selection: $model) {
                        ForEach(Settings.models, id: \.id) { Text($0.label).tag($0.id) }
                    }
                } header: {
                    Text("Modèle Whisper")
                }

                Section {
                    TextEditor(text: $vocabulary).frame(minHeight: 120)
                    Button("Rétablir le vocabulaire Phénix") { vocabulary = Settings.defaultVocabulary }
                } header: {
                    Text("Vocabulaire")
                } footer: {
                    Text("Noms, sigles et systèmes cités en réunion : Whisper les écrit mieux s'il les connaît.")
                }
            }
            .navigationTitle("Réglages")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } }
            }
        }
    }
}
