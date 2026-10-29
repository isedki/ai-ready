// swift-tools-version: 5.10
// Logique pure de l'app Réunions (modèles, glossaire Phénix, export, découpage audio, stockage).
// Sans dépendance externe : testable avec `swift test` sur macOS comme sur Linux.
import PackageDescription

let package = Package(
    name: "ReunionsCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "ReunionsCore", targets: ["ReunionsCore"]),
    ],
    targets: [
        .target(name: "ReunionsCore"),
        .testTarget(name: "ReunionsCoreTests", dependencies: ["ReunionsCore"]),
    ]
)
