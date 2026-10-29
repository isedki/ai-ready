import ReunionsCore
import SwiftUI
import UIKit

struct MeetingDetailView: View {
    let meetingID: UUID

    @Environment(MeetingStore.self) private var store
    @Environment(Transcriber.self) private var transcriber
    @AppStorage(Settings.modelKey) private var model = WhisperModels.default
    @AppStorage(Settings.languageKey) private var language = LanguageMode.auto.rawValue
    @AppStorage(Settings.vocabularyKey) private var vocabulary = ""
    @State private var copied = false

    var body: some View {
        if let m = store.meeting(meetingID) {
            content(m)
        } else {
            ContentUnavailableView("Réunion introuvable", systemImage: "questionmark")
        }
    }

    private func content(_ m: Meeting) -> some View {
        List {
            Section {
                LabeledContent("Date", value: m.date.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Durée", value: Export.clock(m.duration))
                if !m.participants.isEmpty { LabeledContent("Participants", value: m.participants) }
                if let used = m.transcriptionModel {
                    LabeledContent("Transcrite avec", value: "\(used.replacingOccurrences(of: "large-v3-v20240930_", with: "large-v3 ")) · \(m.transcriptionMode?.rawValue ?? "auto")")
                }
                if let error = store.lastError {
                    Text(error).font(.caption).foregroundStyle(.red)
                }
            }

            Section {
                transcriptionControls(m)
            } header: {
                Text("Transcription")
            } footer: {
                Text("Hors ligne, sur l'iPhone. Garde l'app ouverte : compter environ un tiers à la moitié de la durée de la réunion. Au premier usage, le modèle (~600 Mo) se télécharge : fais-le en Wi-Fi.")
            }

            if !m.segments.isEmpty {
                Section {
                    Button {
                        UIPasteboard.general.string = Export.forClaude(m)
                        copied = true
                    } label: {
                        Label(copied ? "Copié : colle-le dans Claude" : "Copier pour Claude (CR + suivi)", systemImage: copied ? "checkmark" : "doc.on.doc")
                    }
                    ShareLink(item: Export.text(m), subject: Text(m.title)) {
                        Label("Partager la transcription", systemImage: "square.and.arrow.up")
                    }
                }
            }

            if !m.markers.isEmpty {
                Section("Marqueurs") {
                    ForEach(m.markers) { mk in
                        Text("\(Export.clock(mk.time)) · \(mk.kind.rawValue)")
                    }
                }
            }

            if !m.segments.isEmpty {
                Section("Texte") {
                    ForEach(Export.paragraphs(m)) { p in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(Export.clock(p.start)) · \(p.language)").font(.caption).foregroundStyle(.secondary)
                            Text(p.text)
                                .textSelection(.enabled)
                                .environment(\.layoutDirection, p.language == "ar" ? .rightToLeft : .leftToRight)
                        }
                    }
                }
            }
        }
        .navigationTitle(m.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder private func transcriptionControls(_ m: Meeting) -> some View {
        if transcriber.activeMeeting == m.id {
            switch transcriber.phase {
            case .loadingModel:
                ProgressView("Chargement du modèle…")
            case .transcribing(let progress):
                ProgressView(value: progress) {
                    Text("Transcription \(Int(progress * 100)) %")
                }
            default:
                ProgressView()
            }
            Button("Arrêter", role: .destructive) { transcriber.cancel() }
        } else {
            let mode = LanguageMode(rawValue: language) ?? .auto
            if case .failed(let message) = transcriber.phase, m.status == .failed {
                Text(message).font(.caption).foregroundStyle(.orange)
            }
            if m.status != .transcribed {
                Button {
                    transcriber.start(m, store: store, model: model, mode: mode, vocabulary: vocabulary, restart: false)
                } label: {
                    Label(m.transcribedUntil > 0 ? "Reprendre la transcription" : "Transcrire", systemImage: "text.bubble")
                }
                .disabled(transcriber.activeMeeting != nil)
            }
            if m.transcribedUntil > 0 {
                Menu {
                    ForEach(LanguageMode.allCases) { lm in
                        Button(lm.label) {
                            transcriber.start(m, store: store, model: model, mode: lm, vocabulary: vocabulary, restart: true)
                        }
                    }
                } label: {
                    Label("Retranscrire avec…", systemImage: "arrow.clockwise")
                }
                .disabled(transcriber.activeMeeting != nil)
            }
        }
    }
}
