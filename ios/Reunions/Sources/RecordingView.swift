import SwiftUI

/// Saisie du titre, puis enregistrement plein écran avec marqueurs.
struct RecordingView: View {
    var onFinish: (UUID) -> Void

    @Environment(MeetingStore.self) private var store
    @Environment(Recorder.self) private var recorder
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var participants = ""
    @State private var meeting: Meeting?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if meeting == nil { setup } else { live }
            }
            .navigationTitle(meeting == nil ? "Nouvelle réunion" : displayTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if meeting == nil {
                    ToolbarItem(placement: .cancellationAction) { Button("Annuler") { dismiss() } }
                }
            }
            .alert("Enregistrement impossible", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) {
                Button("OK") {}
            } message: {
                Text(error ?? "")
            }
        }
        .interactiveDismissDisabled(meeting != nil)
    }

    private var displayTitle: String {
        title.isEmpty ? "Réunion du \(Date.now.formatted(date: .abbreviated, time: .shortened))" : title
    }

    private var setup: some View {
        Form {
            Section {
                TextField("Titre (ex. Weekly IT)", text: $title)
                TextField("Participants", text: $participants, axis: .vertical)
            }
            Section {
                Button {
                    Task { await start() }
                } label: {
                    Label("Démarrer l'enregistrement", systemImage: "record.circle").font(.headline)
                }
            } footer: {
                Text("Annonce en début de réunion que tu enregistres pour le compte rendu. L'enregistrement continue écran verrouillé.")
            }
        }
    }

    private var live: some View {
        VStack(spacing: 28) {
            Spacer()
            Text(Export.clock(recorder.elapsed))
                .font(.system(size: 56, weight: .light, design: .monospaced))
            ProgressView(value: Double(recorder.level))
                .tint(recorder.isPaused ? .gray : .red)
                .padding(.horizontal, 40)
            Text(recorder.isPaused ? "En pause" : "Enregistrement…")
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                ForEach(Marker.Kind.allCases, id: \.self) { kind in
                    Button(kind.rawValue) { recorder.addMarker(kind) }
                        .buttonStyle(.bordered)
                }
            }
            if !recorder.markers.isEmpty {
                Text("\(recorder.markers.count) marqueur(s)").font(.caption).foregroundStyle(.secondary)
            }

            Spacer()
            HStack(spacing: 40) {
                Button {
                    recorder.isPaused ? recorder.resume() : recorder.pause()
                } label: {
                    Image(systemName: recorder.isPaused ? "play.circle" : "pause.circle").font(.system(size: 56))
                }
                Button(role: .destructive) {
                    finish()
                } label: {
                    Image(systemName: "stop.circle.fill").font(.system(size: 72)).foregroundStyle(.red)
                }
            }
            .padding(.bottom, 32)
        }
    }

    private func start() async {
        let m = store.newMeeting(title: displayTitle, participants: participants)
        do {
            try await recorder.start(to: store.audioURL(m))
            store.save(m)           // la réunion existe dès le début, même si l'app est fermée en cours
            meeting = m
        } catch {
            store.delete(m)
            self.error = error.localizedDescription
        }
    }

    private func finish() {
        guard var m = meeting else { return }
        let result = recorder.stop()
        m.title = displayTitle
        m.participants = participants
        m.duration = result.duration
        m.markers = result.markers
        store.save(m)
        dismiss()
        onFinish(m.id)
    }
}
