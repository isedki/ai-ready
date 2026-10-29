import XCTest
@testable import ReunionsCore

final class MeetingFilesTests: XCTestCase {
    private var root: URL!
    private var files: MeetingFiles!

    override func setUp() {
        root = FileManager.default.temporaryDirectory.appendingPathComponent("reunions-tests-\(UUID().uuidString)")
        files = MeetingFiles(root: root)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: root)
    }

    func testSaveLoadRoundTrip() throws {
        var m = files.newMeeting(title: "Weekly IT", participants: "Salah, Amine", date: Date(timeIntervalSince1970: 1_000))
        m.duration = 3600
        m.markers = [Marker(time: 12, kind: .decision)]
        m.segments = [Segment(start: 0, end: 4, language: "ar", text: "واخا نبداو")]
        m.transcribedUntil = 3600
        m.status = .transcribed
        m.transcriptionMode = .auto
        try files.save(m)

        let loaded = files.loadAll()
        XCTAssertEqual(loaded, [m])
    }

    func testLoadSortsNewestFirstAndSkipsBrokenFolders() throws {
        let old = files.newMeeting(title: "Ancienne", participants: "", date: Date(timeIntervalSince1970: 1_000))
        let new = files.newMeeting(title: "Récente", participants: "", date: Date(timeIntervalSince1970: 2_000))
        try files.save(old)
        try files.save(new)
        let broken = root.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: broken, withIntermediateDirectories: true)
        try Data("pas du json".utf8).write(to: broken.appendingPathComponent("meeting.json"))

        XCTAssertEqual(files.loadAll().map(\.title), ["Récente", "Ancienne"])
    }

    func testDecodesOldOrPartialJSON() throws {
        let id = UUID()
        let json = #"{"id":"\#(id.uuidString)","title":"Point CreditSet","status":"statut-inconnu","segments":[]}"#
        let m = try MeetingFiles.decoder.decode(Meeting.self, from: Data(json.utf8))
        XCTAssertEqual(m.id, id)
        XCTAssertEqual(m.title, "Point CreditSet")
        XCTAssertEqual(m.status, .recorded)
        XCTAssertEqual(m.audioFile, "audio.caf")
        XCTAssertEqual(m.transcribedUntil, 0)
        XCTAssertNil(m.transcriptionModel)
    }

    func testDelete() throws {
        let m = files.newMeeting(title: "À supprimer", participants: "")
        try files.save(m)
        try files.delete(m)
        XCTAssertTrue(files.loadAll().isEmpty)
        XCTAssertFalse(FileManager.default.fileExists(atPath: files.folder(m.id).path))
        XCTAssertNoThrow(try files.delete(m))      // supprimer deux fois ne plante pas
    }

    func testImportAudioCopiesFileAndKeepsExtension() throws {
        let source = FileManager.default.temporaryDirectory.appendingPathComponent("Weekly IT 29-10.m4a")
        try Data([1, 2, 3]).write(to: source)
        defer { try? FileManager.default.removeItem(at: source) }

        let m = try files.importAudio(from: source)
        XCTAssertEqual(m.title, "Weekly IT 29-10")
        XCTAssertEqual(m.audioFile, "audio.m4a")
        XCTAssertEqual(try Data(contentsOf: files.audioURL(m)), Data([1, 2, 3]))
    }

    func testImportOfMissingFileLeavesNoFolder() {
        let missing = FileManager.default.temporaryDirectory.appendingPathComponent("absent-\(UUID().uuidString).m4a")
        XCTAssertThrowsError(try files.importAudio(from: missing))
        let folders = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
        XCTAssertTrue(folders.isEmpty)
    }
}
