// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "CococoJinja",
    platforms: [.macOS(.v13), .iOS(.v16), .visionOS(.v1)],
    products: [
        .library(name: "CococoJinja", targets: ["CococoJinja"]),
    ],
    targets: [
        // Canonical Jinja-subset expression engine, extracted from WorkflowKit.
        // No external dependencies — pure Swift + Foundation, Linux-capable.
        .target(name: "CococoJinja"),
        .testTarget(name: "CococoJinjaTests", dependencies: ["CococoJinja"]),
    ]
)
