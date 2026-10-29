import XCTest
@testable import ReunionsCore

final class GlossaryTests: XCTestCase {
    func testCorrectsFrequentMishearings() {
        let input = "Le projet phoenix chez in wi : le flux Wallis vers a pigée est bloqué en v a b f, eb 25 et crédit set, cafka, atosse et aime gen 3918."
        XCTAssertEqual(
            Glossary.correct(input),
            "Le projet Phénix chez inwi : le flux Wallix vers APIGEE est bloqué en VABF, EB25 et CreditSet, Kafka, Atos et MGEN 3918."
        )
    }

    func testCorrectionsAreCaseInsensitiveAndKeepPunctuation() {
        XCTAssertEqual(Glossary.correct("WALLIS, apigee. Boudrika?"), "Wallix, APIGEE. Boudriga?")
        XCTAssertEqual(Glossary.correct("(flow one)"), "(FlowOne)")
        XCTAssertEqual(Glossary.correct("le dry run et le cut over"), "le dry run et le cutover")
    }

    func testDoesNotTouchOrdinaryWords() {
        let ordinary = [
            "La gentillesse de l'équipe est un atout.",
            "Le Lagrangien et la gare de Rabat.",
            "Inwiz et Wallisien ne sont pas concernés.",
            "Le cafetier a pris un café.",
            "Les messages sont envoyés en mars.",
        ]
        for sentence in ordinary {
            XCTAssertEqual(Glossary.correct(sentence), sentence, sentence)
        }
    }

    func testLeavesArabicScriptUnchanged() {
        let arabic = "الفلوكس ديال والليكس ما خدامش"
        XCTAssertEqual(Glossary.correct(arabic), arabic)
    }

    func testAlreadyCorrectTermsAreStable() {
        let correct = "Phénix, inwi, Atos, Inetum, EB25, BSCS, Wallix, APIGEE, VABF, MGEN, CreditSet, Kafka, FlowOne, Boudriga."
        XCTAssertEqual(Glossary.correct(correct), correct)
        XCTAssertEqual(Glossary.correct(Glossary.correct(correct)), correct)
    }

    func testEveryCorrectionPatternCompiles() {
        for item in Glossary.corrections {
            XCTAssertNoThrow(try NSRegularExpression(pattern: item.pattern, options: [.caseInsensitive]), item.pattern)
        }
    }

    func testPromptPutsParticipantsLast() {
        let prompt = Glossary.prompt(participants: "Salah Gharmili, Faris Hajji\nAnas El Jadidi", extra: "MGEN3918, lettrage")
        XCTAssertTrue(prompt.hasPrefix("Réunion du projet Phénix"))
        XCTAssertTrue(prompt.hasSuffix("Participants : Salah Gharmili, Faris Hajji, Anas El Jadidi."))
        XCTAssertTrue(prompt.contains("MGEN3918, lettrage"))
        XCTAssertTrue(prompt.contains("Wallix"))
    }

    func testPromptWithoutParticipantsOrExtra() {
        let prompt = Glossary.prompt(participants: "  ", extra: "")
        XCTAssertFalse(prompt.contains("Participants"))
        XCTAssertTrue(prompt.hasSuffix(Glossary.priority.joined(separator: ", ") + "."))
    }

    func testFullTextListsAllPeople() {
        for person in Glossary.people {
            XCTAssertTrue(Glossary.fullText.contains(person), person)
        }
    }
}
