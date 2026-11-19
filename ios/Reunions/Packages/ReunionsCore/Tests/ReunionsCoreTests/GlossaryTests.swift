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

    /// Erreurs relevées dans le test de bout en bout (voix de synthèse, modèle large-v3 turbo).
    func testCorrectsErrorsSeenInEndToEndRun() {
        XCTAssertEqual(
            Glossary.correct("C'est le Weekly Hit. WallX pour Inetum, MGN-4007 validé. Badrjbari et le support sécurité."),
            "C'est le Weekly IT. Wallix pour Inetum, MGEN-4007 validé. Badr Jbari et le Support Sécurité."
        )
        XCTAssertEqual(
            Glossary.correct("Action pour Fari Adji sur Exabi25 et E-B 25. Crédit 7 passe en production, et Apig expose le service."),
            "Action pour Faris Hajji sur EB25 et EB25. CreditSet passe en production, et APIGEE expose le service."
        )
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
        XCTAssertTrue(prompt.hasPrefix("Bonjour à tous"))
        XCTAssertTrue(prompt.hasSuffix("Sont présents Salah Gharmili, Faris Hajji, Anas El Jadidi."))
        XCTAssertTrue(prompt.contains("On parle aussi de MGEN3918, lettrage."))
        XCTAssertTrue(prompt.contains("Wallix"))
    }

    /// Whisper imite le style de l'amorce : elle doit ressembler à des phrases, pas à une liste de sigles.
    func testPromptReadsAsSentences() {
        let prompt = Glossary.prompt(participants: "", extra: "")
        XCTAssertFalse(prompt.contains("Sont présents"))
        let sentences = prompt.split(separator: ".").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        XCTAssertGreaterThanOrEqual(sentences.count, 3)
        for sentence in sentences {
            let words = sentence.split(separator: " ")
            let commas = sentence.filter { $0 == "," }.count
            XCTAssertLessThan(commas, words.count / 3, "trop proche d'une liste : \(sentence)")
        }
        for term in ["Phénix", "VABF", "Wallix", "APIGEE", "EB25", "MGEN", "CreditSet", "OCS", "SOA"] {
            XCTAssertTrue(prompt.contains(term), term)
        }
    }

    func testFullTextListsAllPeople() {
        for person in Glossary.people {
            XCTAssertTrue(Glossary.fullText.contains(person), person)
        }
    }
}
