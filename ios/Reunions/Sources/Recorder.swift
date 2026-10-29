import AVFoundation
import Observation

enum RecorderError: LocalizedError {
    case permissionDenied, cannotStart
    var errorDescription: String? {
        switch self {
        case .permissionDenied: "Accès au micro refusé : Réglages › Réunions › Micro."
        case .cannotStart: "Le micro n'a pas pu démarrer."
        }
    }
}

/// Enregistre en AAC 16 kHz mono (le format attendu par Whisper, ~30 Mo par heure).
/// Continue écran verrouillé grâce au mode d'arrière-plan « audio ».
@Observable
final class Recorder {
    private(set) var isRecording = false
    private(set) var isPaused = false
    private(set) var elapsed: TimeInterval = 0
    /// Niveau du micro entre 0 et 1, pour l'indicateur.
    private(set) var level: Float = 0
    private(set) var markers: [Marker] = []

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var interruptionObserver: NSObjectProtocol?
    private var pausedByInterruption = false

    func start(to url: URL) async throws {
        guard await AVAudioApplication.requestRecordPermission() else { throw RecorderError.permissionDenied }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .default)
        try session.setActive(true)

        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 16_000,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        let r = try AVAudioRecorder(url: url, settings: settings)
        r.isMeteringEnabled = true
        guard r.record() else { throw RecorderError.cannotStart }

        recorder = r
        markers = []
        elapsed = 0
        isRecording = true
        isPaused = false
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.tick() }

        // Appel entrant ou alarme : iOS met l'enregistrement en pause ; on reprend dès que possible.
        interruptionObserver = NotificationCenter.default.addObserver(
            forName: AVAudioSession.interruptionNotification, object: session, queue: .main
        ) { [weak self] note in
            guard let self, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            if type == .began {
                self.pausedByInterruption = !self.isPaused
                self.isPaused = true
            } else if self.pausedByInterruption {
                self.pausedByInterruption = false
                try? AVAudioSession.sharedInstance().setActive(true)
                if self.recorder?.record() == true { self.isPaused = false }
            }
        }
    }

    func pause() {
        recorder?.pause()
        isPaused = true
    }

    func resume() {
        if recorder?.record() == true { isPaused = false }
    }

    func addMarker(_ kind: Marker.Kind) {
        markers.append(Marker(time: elapsed, kind: kind))
    }

    /// Arrête et renvoie la durée et les marqueurs posés.
    func stop() -> (duration: TimeInterval, markers: [Marker]) {
        let duration = recorder?.currentTime ?? elapsed
        recorder?.stop()
        recorder = nil
        timer?.invalidate()
        timer = nil
        if let interruptionObserver { NotificationCenter.default.removeObserver(interruptionObserver) }
        interruptionObserver = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        isRecording = false
        isPaused = false
        level = 0
        return (max(duration, elapsed), markers)
    }

    private func tick() {
        guard let r = recorder else { return }
        if r.isRecording { elapsed = r.currentTime }
        r.updateMeters()
        let db = r.averagePower(forChannel: 0)      // -160 (silence) … 0 dB
        level = max(0, min(1, (db + 50) / 50))
    }
}
