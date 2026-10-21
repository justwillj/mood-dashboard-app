import Foundation
#if canImport(SwiftUI)
import SwiftUI
#endif

/// Hex + alpha. Replaces the old "rgba() for the WebView, hex for widgets" split:
/// SwiftUI `Color` handles alpha everywhere, so one palette serves app and widgets.
public struct HexColor: Codable, Equatable, Sendable {
    public let hex: String
    public let alpha: Double

    public init(_ hex: String, _ alpha: Double = 1) {
        self.hex = hex
        self.alpha = alpha
    }

    public var rgb: (r: Double, g: Double, b: Double) {
        var v: UInt64 = 0
        Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
        return (Double((v >> 16) & 0xFF) / 255, Double((v >> 8) & 0xFF) / 255, Double(v & 0xFF) / 255)
    }
}

#if canImport(SwiftUI)
public extension Color {
    init(_ c: HexColor) {
        let x = c.rgb
        self.init(.sRGB, red: x.r, green: x.g, blue: x.b, opacity: c.alpha)
    }
}
#endif

public struct Theme: Codable, Equatable, Identifiable, Sendable {
    public var id: String
    public var name: String
    public var bg, card, cardSec, heroMe, heroPartner: HexColor
    public var accentMe, accentPartner, dots, note: HexColor
    public var text, textDim, textSub: HexColor
    public var border, borderPartner: HexColor
    public var btnPrimary, btnPrimaryBorder: HexColor
}

public extension Theme {
    static let forest = Theme(
        id: "forest", name: "Forest & Sage",
        bg: .init("#121915"), card: .init("#1B241F"), cardSec: .init("#161D19"),
        heroMe: .init("#1A2620"), heroPartner: .init("#241D1A"),
        accentMe: .init("#8DA399"), accentPartner: .init("#D97757"),
        dots: .init("#E0A96D"), note: .init("#E0A96D"),
        text: .init("#F4F1EA"), textDim: .init("#A3ADA7"), textSub: .init("#75827A"),
        border: .init("#A7C4B5", 0.15), borderPartner: .init("#D97757", 0.3),
        btnPrimary: .init("#4F6D60"), btnPrimaryBorder: .init("#628576"))

    static let sand = Theme(
        id: "sand", name: "Warm Sand & Clay",
        bg: .init("#181513"), card: .init("#231F1C"), cardSec: .init("#1D1916"),
        heroMe: .init("#26211C"), heroPartner: .init("#281D1A"),
        accentMe: .init("#D69F54"), accentPartner: .init("#C26D53"),
        dots: .init("#E7B068"), note: .init("#D69F54"),
        text: .init("#F5EDE4"), textDim: .init("#A89F96"), textSub: .init("#7B736B"),
        border: .init("#D69F54", 0.15), borderPartner: .init("#C26D53", 0.38),
        btnPrimary: .init("#7E5835"), btnPrimaryBorder: .init("#966B43"))

    static let midnight = Theme(
        id: "midnight", name: "Midnight Neon",
        bg: .init("#0B0C10"), card: .init("#1E1F29"), cardSec: .init("#171821"),
        heroMe: .init("#FFFFFF", 0.08), heroPartner: .init("#FFFFFF", 0.08),
        accentMe: .init("#818CF8"), accentPartner: .init("#F472B6"),
        dots: .init("#00E5FF"), note: .init("#FFB6C1"),
        text: .init("#FFFFFF"), textDim: .init("#FFFFFF", 0.6), textSub: .init("#FFFFFF", 0.45),
        border: .init("#FFFFFF", 0.12), borderPartner: .init("#EC4899", 0.3),
        btnPrimary: .init("#6366F1"), btnPrimaryBorder: .init("#6366F1"))

    static let all: [Theme] = [.forest, .sand, .midnight]

    static func named(_ id: String?) -> Theme { all.first { $0.id == id } ?? .forest }

    func next() -> Theme {
        let i = Theme.all.firstIndex { $0.id == id } ?? 0
        return Theme.all[(i + 1) % Theme.all.count]
    }
}
