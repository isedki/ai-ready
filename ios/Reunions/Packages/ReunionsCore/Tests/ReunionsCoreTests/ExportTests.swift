import XCTest
@testable import ReunionsCore

final class ExportTests: XCTestCase {
    func testClock() {
        XCTAssertEqual(Export.clock(0), "00:00:00")
        XCTAssertEqual(Export.clock(59.6), "00:01:00")
        XCTAssertEqual(Export.clock(3725), "01:02:05")
    }

    func testDateTextIsFrenchAndDeterministic() {
        let date = Date(timeIntervalSince1970: 1_793_290_016)        // 2026-10-29 16:06:56 UTC
        XCTAssertEqual(Export.dateText(date, timeZone: TimeZone(identifier: "Africa/Casablanca")!), "29/10/2026 17:06")
    }

    func testParagraphsSplitOnLanguageChange() {
        let m = meeting(segments: [
            Segment(start: 0, end: 5, language: "fr", text: "Bonjour à tous."),
            Segment(start: 5, end: 9, language: "fr", text: "On commence par le flux OCS."),
            Segment(start: 9, end: 15, language: "ar", text: "واخا"),
            Segment(start: 15, end: 20, language: "fr", text: "Badr valide lundi."),
        ])
        let p = Export.paragraphs(m)
        XCTAssertEqual(p.map(\.language), ["fr", "ar", "fr"])
        XCTAssertEqual(p[0].text, "Bonjour à tous. On commence par le flux OCS.")
        XCTAssertEqual(p[2].start, 15)
    }

    func testParagraphsSplitEveryTwoMinutes() {
        let segs = stride(from: 0.0, to: 300.0, by: 10.0).map { Segment(start: $0, end: $0 + 10, language: "fr", text: "x") }
        let p = Export.paragraphs(meeting(segments: segs))
        XCTAssertEqual(p.map(\.start), [0, 130, 260])
    }

    func testTextContainsHeaderMarkersAndTimestamps() {
        var m = meeting(segments: [Segment(start: 61, end: 70, language: "fr", text: "Faris applique la configuration.")])
        m.participants = "Faris Hajji, Anas El Jadidi"
        m.markers = [Marker(time: 65, kind: .action)]
        m.transcriptionModel = WhisperModels.default
        m.transcriptionMode = .auto
        let text = Export.text(m)
        XCTAssertTrue(text.hasPrefix("# Weekly IT\n"))
        XCTAssertTrue(text.contains("Participants : Faris Hajji, Anas El Jadidi"))
        XCTAssertTrue(text.contains("- [00:01:05] Action"))
        XCTAssertTrue(text.contains("[00:01:01 · fr] Faris applique la configuration."))
        XCTAssertTrue(text.contains("Transcription : Whisper large-v3-v20240930_626MB, mode auto"))
    }

    func testForClaudeIncludesInstructionsGlossaryAndTranscript() {
        let m = meeting(segments: [Segment(start: 0, end: 3, language: "fr", text: "Test.")])
        let prompt = Export.forClaude(m)
        XCTAssertTrue(prompt.contains("compte rendu au style Issam"))
        XCTAssertTrue(prompt.contains("Glossaire Phénix"))
        XCTAssertTrue(prompt.contains("Mohamed Ali Boudriga"))
        XCTAssertTrue(prompt.contains("[00:00:00 · fr] Test."))
    }

    private func meeting(segments: [Segment]) -> Meeting {
        Meeting(title: "Weekly IT", date: Date(timeIntervalSince1970: 0), audioFile: "audio.caf", segments: segments)
    }
}
