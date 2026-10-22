// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MoodCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "MoodCore", targets: ["MoodCore"])],
    targets: [
        .target(name: "MoodCore"),
        .testTarget(name: "MoodCoreTests", dependencies: ["MoodCore"]),
    ]
)
