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

final class LanguageRunTests: XCTestCase {
    func testMergesConsecutivePiecesOfTheSameLanguage() {
        let runs = TranscriptionEngine.mergeRuns([
            (0..<100, "fr"), (100..<200, "fr"), (200..<260, "ar"), (260..<300, "fr"), (300..<400, "fr"),
        ])
        XCTAssertEqual(runs.map { $0.range }, [0..<200, 200..<260, 260..<400])
        XCTAssertEqual(runs.map { $0.language }, ["fr", "ar", "fr"])
    }

    func testDoesNotMergeAcrossAGap() {
        let runs = TranscriptionEngine.mergeRuns([(0..<100, "fr"), (150..<200, "fr")])
        XCTAssertEqual(runs.count, 2)
    }

    func testLogProbabilitiesFallback() {
        // WhisperKit renvoie des log-probabilités : une langue absente ne doit pas l'emporter.
        XCTAssertEqual(TranscriptionEngine.pickLanguage(detected: "en", probabilities: ["en": -0.1, "ar": -2.0]), "ar")
        XCTAssertEqual(TranscriptionEngine.pickLanguage(detected: "en", probabilities: ["en": -0.1, "fr": -1.5, "ar": -3.0]), "fr")
    }
}
