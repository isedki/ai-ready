/// Choix du point de coupe entre deux tranches audio.
public enum AudioCut {
    /// Découpe une fenêtre en morceaux d'environ `target` secondes (entre `minimum` et `maximum`), coupés sur
    /// les silences. Sert à détecter la langue phrase par phrase : en réunion, on passe du darija au français
    /// d'une phrase à l'autre, alors qu'une détection sur 30 s ne voit que la langue majoritaire.
    public static func pieces(_ samples: [Float], sampleRate: Int, minimum: Double = 5, maximum: Double = 11) -> [Range<Int>] {
        let minLength = Int(minimum * Double(sampleRate))
        let maxLength = Int(maximum * Double(sampleRate))
        guard minLength > 0, maxLength > minLength else { return samples.isEmpty ? [] : [0..<samples.count] }
        var ranges: [Range<Int>] = []
        var start = 0
        while samples.count - start > maxLength {
            let window = Array(samples[(start + minLength)..<(start + maxLength)])
            let cut = quietestCut(window, sampleRate: sampleRate, searchFrom: 0) ?? window.count
            let end = start + minLength + cut
            ranges.append(start..<end)
            start = end
        }
        if start < samples.count { ranges.append(start..<samples.count) }
        return ranges
    }

    /// Index (en échantillons) du moment le plus calme entre `searchFrom` secondes et la fin de la fenêtre,
    /// par trames de 0,1 s. Couper sur un silence évite de couper un mot en deux, ce qui est la principale
    /// source d'erreurs aux jointures entre tranches. Renvoie nil si la fenêtre est trop courte pour chercher.
    public static func quietestCut(_ samples: [Float], sampleRate: Int, searchFrom: Double = 22) -> Int? {
        let frame = max(1, sampleRate / 10)
        let from = Int(searchFrom * Double(sampleRate))
        guard from >= 0, samples.count >= from + frame else { return nil }
        var bestEnergy = Float.greatestFiniteMagnitude
        var bestIndex: Int?
        var i = from
        while i + frame <= samples.count {
            var energy: Float = 0
            for j in i..<(i + frame) { energy += samples[j] * samples[j] }
            if energy < bestEnergy {
                bestEnergy = energy
                bestIndex = i + frame / 2
            }
            i += frame
        }
        return bestIndex
    }
}
