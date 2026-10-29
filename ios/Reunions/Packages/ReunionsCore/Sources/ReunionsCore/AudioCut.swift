/// Choix du point de coupe entre deux tranches audio.
public enum AudioCut {
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
