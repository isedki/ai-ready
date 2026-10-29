import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @Environment(MeetingStore.self) private var store
    @State private var path: [UUID] = []
    @State private var showRecorder = false
    @State private var showImporter = false
    @State private var showSettings = false
    @State private var importError: String?

    var body: some View {
        NavigationStack(path: $path) {
            List {
                ForEach(store.meetings) { m in
                    NavigationLink(value: m.id) { MeetingRow(meeting: m) }
                }
                .onDelete { offsets in
                    offsets.map { store.meetings[$0] }.forEach(store.delete)
                }
            }
            .overlay {
                if store.meetings.isEmpty {
                    ContentUnavailableView(
                        "Aucune réunion",
                        systemImage: "waveform",
                        description: Text("Appuie sur le micro pour enregistrer, ou importe un audio (Plaud, Dictaphone).")
                    )
                }
            }
            .navigationTitle("Réunions")
            .navigationDestination(for: UUID.self) { id in MeetingDetailView(meetingID: id) }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { showSettings = true } label: { Image(systemName: "gearshape") }
                }
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button { showImporter = true } label: { Image(systemName: "square.and.arrow.down") }
                    Button { showRecorder = true } label: { Image(systemName: "mic.circle.fill").font(.title2) }
                }
            }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.audio]) { result in
                do {
                    let m = try store.importAudio(from: result.get())
                    path.append(m.id)
                } catch {
                    importError = error.localizedDescription
                }
            }
            .fullScreenCover(isPresented: $showRecorder) {
                RecordingView { id in path.append(id) }
            }
            .sheet(isPresented: $showSettings) { SettingsView() }
            .alert("Import impossible", isPresented: Binding(get: { importError != nil }, set: { if !$0 { importError = nil } })) {
                Button("OK") {}
            } message: {
                Text(importError ?? "")
            }
        }
    }
}

struct MeetingRow: View {
    let meeting: Meeting

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(meeting.title).font(.headline)
            HStack {
                Text(meeting.date.formatted(date: .abbreviated, time: .shortened))
                Text("·")
                Text(Export.clock(meeting.duration))
                Spacer()
                statusLabel
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var statusLabel: some View {
        switch meeting.status {
        case .recorded: Label("À transcrire", systemImage: "waveform")
        case .transcribing: Label("En cours", systemImage: "hourglass")
        case .transcribed: Label("Transcrite", systemImage: "checkmark.circle").foregroundStyle(.green)
        case .failed: Label("Échec", systemImage: "exclamationmark.triangle").foregroundStyle(.orange)
        }
    }
}
