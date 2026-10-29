import Foundation

/// Jargon du projet Phénix : sert à trois endroits.
/// 1. L'amorce Whisper (vocabulaire prioritaire + participants de la réunion) : Whisper écrit mieux ce qu'il connaît.
/// 2. Les corrections automatiques des erreurs d'écoute fréquentes, appliquées à chaque passage.
/// 3. La consigne envoyée à Claude, qui corrige le reste à partir du glossaire complet.
enum Glossary {
    /// Termes les plus fréquents en réunion. L'amorce Whisper est limitée (~200 jetons), donc cette liste reste courte.
    static let priority = [
        "Phénix", "inwi", "Atos", "Inetum", "Ericsson", "EB25", "BSCS", "OCS", "SDP", "SOA", "OSB Noor",
        "APIGEE", "API Digital", "Wallix", "VABF", "MEP", "PROD", "MGEN", "MC", "LLD", "DAT", "COPIL",
        "CreditSet", "Lagrange", "Kafka", "FlowOne", "Salesforce", "dry run", "cutover", "Bill Compare",
    ]

    static let systems = [
        "EB25", "EB24", "BSCS", "IMX", "OCS", "SDP", "SOA", "OSB Noor", "OSB Legacy", "APIGEE", "API Digital", "API façade",
        "Wallix", "VPN", "Kafka", "Lagrange", "CreditSet", "Caméléon", "Flexi", "Salesforce B2C", "Salesforce B2B", "Vlocity",
        "PowerCard", "USSD", "IVR", "SAP", "DCX", "AX", "CX", "DMH", "BCH", "FlowOne", "SFTP", "OpenShift", "Veritas InfoScale",
        "ServiceNow", "Agile", "Elastic", "Grafana", "NeLS", "load balancer", "VIP",
    ]

    static let projectTerms = [
        "VABF", "UAT", "VSR", "MEP", "Go/No Go", "go-live", "cutover", "dry run", "DR Simulation", "Bill Compare", "sanity check",
        "big bang", "rollback", "MGEN", "MC", "EB", "EID", "HLD", "LLD", "DAT", "D-Arch", "PAQ", "matrice de flux", "MdF",
        "DMSI", "DSSI", "Support Sécurité", "Stream Sécurité", "COPIL", "COPROJ", "Weekly IT", "point dépendances",
        "recette", "environnement IG", "environnement INT", "BillCycle", "PRORATA", "lettrage", "recouvrement", "dunning",
        "INC", "REQ", "ticket", "flux any to any", "firewall", "TMA", "garantie",
    ]

    static let people = [
        "Salah Gharmili", "Amine Benchekroun", "Mohammed Dalal", "Ghizlane Akouz", "Younes Eliklil", "Issam Sedki",
        "Mohamed Ali Boudriga", "Mohamed El Ali", "Abdellah Saoudi", "Redouane Tourabi", "Saad Krouit", "Mounir Mabchour",
        "Mustapha Khatar", "Imane Taoufik", "Seddik Bourma", "Karim El Basbassi", "Badr Jbari", "Faris Hajji",
        "Anas El Jadidi", "Toufiq Boukioud", "Abdessamad El Aouni", "Mohamed Aazi", "Abdeljalil Lagnayeg",
        "Adenane Bouhaki", "Yassine Zenouaki", "Mounir Hammam", "Driss El Gaouzi", "Touria Shimi", "Jihane Bennani",
        "Zakaria Louza", "Karim Marouani", "Nada Benabdesslem", "Adil Yamine", "El Mehdi Yagoubi", "Manal Jalyl",
        "Narjis Baji", "Soukaina El Abdellaoui", "Badr Wahby", "Issam Benatik",
    ]

    static let companies = ["inwi", "Atos", "Inetum", "Ericsson", "Xelops", "BearingPoint", "Waroom", "Lagrange Systems"]

    /// Erreurs d'écoute fréquentes → forme correcte. Mots entiers, insensible à la casse.
    /// Ajouter ici chaque erreur récurrente repérée dans les transcriptions.
    static let corrections: [(pattern: String, replacement: String)] = [
        (#"ph[ée]nix|phoenix|f[ée]nix"#, "Phénix"),
        (#"in ?wi|inoui|inwy|in oui"#, "inwi"),
        (#"atoss?e?"#, "Atos"),
        (#"in[ée]tume?|inetom"#, "Inetum"),
        (#"[ée]ricsson|ericson"#, "Ericsson"),
        (#"e\.? ?b\.? ?(25|vingt[- ]cinq)"#, "EB25"),
        (#"e\.? ?b\.? ?(24|vingt[- ]quatre)"#, "EB24"),
        (#"b\.? ?s\.? ?c\.? ?s"#, "BSCS"),
        (#"wallis|walix|wa lix|wallyx|walex"#, "Wallix"),
        (#"a ?pig[ée]e?s?|appig[ée]e|api g[ée]e|apiji"#, "APIGEE"),
        (#"api digitale?"#, "API Digital"),
        (#"v\.? ?a\.? ?b\.? ?f|vabe?f"#, "VABF"),
        (#"m\.? ?gen|aime ?gen|em ?gen"#, "MGEN"),
        (#"cr[ée]dite? ?set|credit-set"#, "CreditSet"),
        (#"lagranges?"#, "Lagrange"),
        (#"caf?ka|kafca|kafkha"#, "Kafka"),
        (#"flow ?one|flo ?one|flow ?wan"#, "FlowOne"),
        (#"dry ?runs?|dra[iy]e? ?run"#, "dry run"),
        (#"cut ?over|kat ?over|cut-over"#, "cutover"),
        (#"bill ?compare|bil compare"#, "Bill Compare"),
        (#"open ?shift"#, "OpenShift"),
        (#"service ?now"#, "ServiceNow"),
        (#"sales ?force"#, "Salesforce"),
        (#"power ?card"#, "PowerCard"),
        (#"boudrika|boudrigua|bou drega"#, "Boudriga"),
        (#"gharmi?li|garmili"#, "Gharmili"),
        (#"benchekroune?|ben chekroun"#, "Benchekroun"),
        (#"saoud?i"#, "Saoudi"),
        (#"tourabie?|tour abi"#, "Tourabi"),
        (#"krou[iy]te?"#, "Krouit"),
        (#"jbar[iy]|djbari"#, "Jbari"),
        (#"zenouak[iy]|zenoaki"#, "Zenouaki"),
        (#"mabchoure?"#, "Mabchour"),
        (#"lagnay[ae]g|laganyeg"#, "Lagnayeg"),
    ]

    private static let compiled: [(NSRegularExpression, String)] = corrections.compactMap { item in
        guard let re = try? NSRegularExpression(pattern: #"(?<![\p{L}\p{N}])(?:"# + item.pattern + #")(?![\p{L}\p{N}])"#,
                                                 options: [.caseInsensitive]) else { return nil }
        return (re, item.replacement)
    }

    /// Applique les corrections (passages en français ; l'écriture arabe n'est pas touchée).
    static func correct(_ text: String) -> String {
        var out = text
        for (re, replacement) in compiled {
            out = re.stringByReplacingMatches(in: out, range: NSRange(out.startIndex..., in: out),
                                              withTemplate: NSRegularExpression.escapedTemplate(for: replacement))
        }
        return out
    }

    /// Amorce Whisper. Si elle est trop longue, c'est le début qui est coupé (on garde la fin) :
    /// l'ordre va donc du moins au plus important, participants de la réunion en dernier.
    static func prompt(participants: String, extra: String) -> String {
        let names = participants.split(whereSeparator: { ",;\n".contains($0) })
            .map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        var parts = ["Réunion du projet Phénix chez inwi, en français et en darija.", priority.joined(separator: ", ") + "."]
        let extraText = extra.trimmingCharacters(in: .whitespacesAndNewlines)
        if !extraText.isEmpty { parts.append(extraText) }
        if !names.isEmpty { parts.append("Participants : " + names.joined(separator: ", ") + ".") }
        return parts.joined(separator: " ")
    }

    /// Glossaire complet pour la consigne envoyée à Claude.
    static var fullText: String {
        """
        Systèmes : \(systems.joined(separator: ", ")).
        Termes projet : \(projectTerms.joined(separator: ", ")).
        Sociétés : \(companies.joined(separator: ", ")).
        Personnes : \(people.joined(separator: ", ")).
        """
    }
}
