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

    private func noise(seconds: Int) -> [Float] {
        var generator = SystemRandomNumberGenerator()
        return (0..<(seconds * rate)).map { _ in Float.random(in: -0.5...0.5, using: &generator) }
    }
}
