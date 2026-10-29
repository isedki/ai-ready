import XCTest
@testable import ReunionsEngine

final class TranscriptionEngineTests: XCTestCase {
    func testKeepsFrenchOrArabicWhenDetected() {
        XCTAssertEqual(TranscriptionEngine.pickLanguage(detected: "ar", probabilities: ["fr": 0.9]), "ar")
        XCTAssertEqual(TranscriptionEngine.pickLanguage(detected: "fr", probabilities: ["ar": 0.9]), "fr")
        XCTAssertEqual(TranscriptionEngine.pickLanguage(detected: "<|ar|>", probabilities: [:]), "ar")
    }

    func testFallsBackToFrenchOrArabicProbabilities() {
        // Darija pris pour du persan ou de l'anglais : on retient la plus probable entre français et arabe.
        XCTAssertEqual(TranscriptionEngine.pickLanguage(detected: "fa", probabilities: ["fa": 0.5, "ar": 0.3, "fr": 0.1]), "ar")
        XCTAssertEqual(TranscriptionEngine.pickLanguage(detected: "en", probabilities: ["<|en|>": 0.6, "<|fr|>": 0.3, "<|ar|>": 0.05]), "fr")
        XCTAssertEqual(TranscriptionEngine.pickLanguage(detected: "en", probabilities: [:]), "fr")
    }

    func testCleanRemovesSpecialTokens() {
        XCTAssertEqual(TranscriptionEngine.clean("<|startoftranscript|><|fr|> Bonjour à tous <|endoftext|>"), "Bonjour à tous")
    }

    func testDetectsKnownHallucinations() {
        XCTAssertTrue(TranscriptionEngine.isHallucination("Sous-titrage ST' 501"))
        XCTAssertTrue(TranscriptionEngine.isHallucination("Merci d'avoir regardé cette vidéo !"))
        XCTAssertFalse(TranscriptionEngine.isHallucination("Merci, on se revoit lundi pour la VABF."))
    }
}
