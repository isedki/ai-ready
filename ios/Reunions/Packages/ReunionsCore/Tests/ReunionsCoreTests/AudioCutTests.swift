import XCTest
@testable import ReunionsCore

final class AudioCutTests: XCTestCase {
    private let rate = 16_000

    /// Bruit partout, sauf un silence de 0,4 s centré à 26,5 s : la coupe doit tomber dans ce silence.
    func testCutsInsideTheSilence() throws {
        var samples = noise(seconds: 30)
        let silence = Int(26.3 * Double(rate))..<Int(26.7 * Double(rate))
        for i in silence { samples[i] = 0 }
        let cut = try XCTUnwrap(AudioCut.quietestCut(samples, sampleRate: rate))
        XCTAssertTrue(silence.contains(cut), "coupe à \(Double(cut) / Double(rate)) s")
    }

    func testIgnoresSilenceBeforeTheSearchWindow() throws {
        var samples = noise(seconds: 30)
        for i in 0..<(10 * rate) { samples[i] = 0 }           // silence à 0-10 s, hors zone de recherche
        let cut = try XCTUnwrap(AudioCut.quietestCut(samples, sampleRate: rate))
        XCTAssertGreaterThanOrEqual(cut, 22 * rate)
        XCTAssertLessThanOrEqual(cut, samples.count)
    }

    func testTooShortWindowReturnsNil() {
        XCTAssertNil(AudioCut.quietestCut(noise(seconds: 20), sampleRate: rate))
        XCTAssertNil(AudioCut.quietestCut([], sampleRate: rate))
    }

    func testCutAlwaysLeavesProgress() throws {
        let samples = [Float](repeating: 0, count: 30 * rate)   // silence total : n'importe quelle coupe ≥ 22 s
        let cut = try XCTUnwrap(AudioCut.quietestCut(samples, sampleRate: rate))
        XCTAssertGreaterThanOrEqual(cut, 22 * rate)
    }

    func testPiecesCoverTheWindowWithoutGapsOrOverlap() {
        let samples = noise(seconds: 30)
        let pieces = AudioCut.pieces(samples, sampleRate: rate)
        XCTAssertEqual(pieces.first?.lowerBound, 0)
        XCTAssertEqual(pieces.last?.upperBound, samples.count)
        for (a, b) in zip(pieces, pieces.dropFirst()) { XCTAssertEqual(a.upperBound, b.lowerBound) }
        for piece in pieces.dropLast() {
            let seconds = Double(piece.count) / Double(rate)
            XCTAssertGreaterThanOrEqual(seconds, 5)
            XCTAssertLessThanOrEqual(seconds, 11)
        }
    }

    /// Une pause entre deux intervenants (ici à 8 s) doit devenir une frontière de morceau.
    func testPiecesCutAtThePauseBetweenSpeakers() {
        var samples = noise(seconds: 20)
        let pause = Int(7.8 * Double(rate))..<Int(8.2 * Double(rate))
        for i in pause { samples[i] = 0 }
        let pieces = AudioCut.pieces(samples, sampleRate: rate)
        XCTAssertTrue(pause.contains(pieces[0].upperBound), "frontière à \(Double(pieces[0].upperBound) / Double(rate)) s")
    }

    func testShortWindowIsOnePiece() {
        let samples = noise(seconds: 4)
        XCTAssertEqual(AudioCut.pieces(samples, sampleRate: rate), [0..<samples.count])
        XCTAssertEqual(AudioCut.pieces([], sampleRate: rate), [])
    }

    private func noise(seconds: Int) -> [Float] {
        var generator = SystemRandomNumberGenerator()
        return (0..<(seconds * rate)).map { _ in Float.random(in: -0.5...0.5, using: &generator) }
    }
}
