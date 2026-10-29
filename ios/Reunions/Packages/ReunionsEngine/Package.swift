// swift-tools-version: 5.10
// Moteur de transcription (WhisperKit) partagé par l'app iPhone et par `reunions-cli`,
// l'outil en ligne de commande qui sert au test de bout en bout sur un Mac (CI GitHub).
import PackageDescription

let package = Package(
    name: "ReunionsEngine",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "ReunionsEngine", targets: ["ReunionsEngine"]),
        .executable(name: "reunions-cli", targets: ["reunions-cli"]),
    ],
    dependencies: [
        .package(path: "../ReunionsCore"),
        .package(url: "https://github.com/argmaxinc/argmax-oss-swift", from: "1.0.0"),
    ],
    targets: [
        .target(
            name: "ReunionsEngine",
            dependencies: [
                .product(name: "ReunionsCore", package: "ReunionsCore"),
                .product(name: "WhisperKit", package: "argmax-oss-swift"),
            ]
        ),
        .testTarget(
            name: "ReunionsEngineTests",
            dependencies: ["ReunionsEngine"]
        ),
        .executableTarget(
            name: "reunions-cli",
            dependencies: [
                "ReunionsEngine",
                .product(name: "ReunionsCore", package: "ReunionsCore"),
            ]
        ),
    ]
)
