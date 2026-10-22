import Foundation

/// Stable identifier for a person. Today: a string you choose at setup.
/// Later: the CloudKit user record name.
public typealias UserID = String

// MARK: - Need ("What I need right now")

public enum Need: String, Codable, CaseIterable, Sendable {
    case space, parallel, distract, comfort, advice

    public var icon: String {
        switch self {
        case .space: "🎧"
        case .parallel: "🛋️"
        case .distract: "💬"
        case .comfort: "🫂"
        case .advice: "💡"
        }
    }

    public var label: String {
        switch self {
        case .space: "Space & quiet"
        case .parallel: "Parallel play (no talking)"
        case .distract: "Distraction / memes"
        case .comfort: "Comfort & warmth"
        case .advice: "Advice wanted"
        }
    }

    public var fullLabel: String { "\(icon) \(label)" }
}

// MARK: - Capacity

public enum TalkPreference: String, Codable, CaseIterable, Sendable {
    case ok, text, none

    public var label: String {
        switch self {
        case .ok: "🗣️ Okay to talk"
        case .text: "💬 Text only"
        case .none: "🔇 No talking"
        }
    }
}

/// All values optional; 1...5 are clamped on init.
public struct Capacity: Codable, Equatable, Sendable {
    public var energy: Int?
    public var social: Int?
    public var sensory: Int?
    public var talk: TalkPreference?

    public init(energy: Int? = nil, social: Int? = nil, sensory: Int? = nil, talk: TalkPreference? = nil) {
        self.energy = Self.clamp(energy)
        self.social = Self.clamp(social)
        self.sensory = Self.clamp(sensory)
        self.talk = talk
    }

    public var isEmpty: Bool { energy == nil && social == nil && sensory == nil && talk == nil }

    static func clamp(_ v: Int?) -> Int? { v.map { min(5, max(1, $0)) } }
}

// MARK: - Mood presets (a mood title + its default energy)

public struct MoodPreset: Codable, Equatable, Identifiable, Sendable {
    public var title: String   // e.g. "🟢 Locked In"
    public var energy: Int     // 1...5
    public var id: String { title }

    public init(title: String, energy: Int) {
        self.title = title
        self.energy = min(5, max(1, energy))
    }

    public static let defaults: [MoodPreset] = [
        .init(title: "🟢 Locked In", energy: 5),
        .init(title: "⚡ Focused", energy: 4),
        .init(title: "🟣 Creative", energy: 3),
        .init(title: "🟡 Chill", energy: 2),
        .init(title: "☕ Cozy", energy: 2),
        .init(title: "🔴 Low Battery", energy: 1),
    ]
}

// MARK: - Friend (one private circle per friend)

public struct Friend: Codable, Equatable, Identifiable, Sendable {
    public var id: UserID
    public var name: String
    /// New check-ins are shared with this friend by default.
    public var autoShare: Bool

    public init(id: UserID, name: String, autoShare: Bool = true) {
        self.id = id
        self.name = name
        self.autoShare = autoShare
    }
}

// MARK: - CheckIn

public struct CheckIn: Codable, Equatable, Identifiable, Sendable {
    public static let maxNoteLength = 140

    public var id: UUID
    public var authorID: UserID
    /// Mood title, e.g. "🟢 Locked In". Empty when `isResting`.
    public var mood: String
    public var isResting: Bool
    public var note: String
    public var noReply: Bool
    public var need: Need?
    public var capacity: Capacity
    /// Friends who can see this check-in. One record, many circles,
    /// so an edit is one write (replaces the "match within 3 minutes" sync hack).
    public var sharedWith: Set<UserID>
    public var createdAt: Date
    public var editedAt: Date?

    public init(
        id: UUID = UUID(),
        authorID: UserID,
        mood: String,
        isResting: Bool = false,
        note: String = "",
        noReply: Bool = false,
        need: Need? = nil,
        capacity: Capacity = .init(),
        sharedWith: Set<UserID>,
        createdAt: Date = Date(),
        editedAt: Date? = nil
    ) {
        self.id = id
        self.authorID = authorID
        self.mood = isResting ? "" : mood
        self.isResting = isResting
        self.note = note
        self.noReply = noReply
        self.need = need
        self.capacity = capacity
        self.sharedWith = sharedWith
        self.createdAt = createdAt
        self.editedAt = editedAt
    }

    public static func resting(authorID: UserID, sharedWith: Set<UserID>, note: String = "") -> CheckIn {
        CheckIn(authorID: authorID, mood: "", isResting: true, note: note, sharedWith: sharedWith)
    }

    /// Port of resolveEnergy(): stored capacity energy wins, then the preset
    /// (exact title, then partial match). Resting has no energy.
    public func energy(presets: [MoodPreset]) -> Int? {
        if isResting { return nil }
        if let e = capacity.energy { return e }
        let key = mood.trimmingCharacters(in: .whitespaces).lowercased()
        guard !key.isEmpty else { return nil }
        let match = presets.first { $0.title.lowercased() == key }
            ?? presets.first { $0.title.lowercased().contains(key) }
        return match?.energy
    }

    public var isEdited: Bool { editedAt != nil }
}

public enum Energy {
    /// "●●●○○"
    public static func dots(_ level: Int?) -> String {
        let n = min(5, max(1, level ?? 3))
        return String(repeating: "●", count: n) + String(repeating: "○", count: 5 - n)
    }
}

// MARK: - Love notes

public enum LoveKind: String, Codable, CaseIterable, Sendable {
    case hug, tea, candle, moon, seed

    public var emoji: String {
        switch self {
        case .hug: "🤗"
        case .tea: "🍵"
        case .candle: "🕯️"
        case .moon: "🌙"
        case .seed: "🌱"
        }
    }

    public var text: String {
        switch self {
        case .hug: "Sending you a hug"
        case .tea: "Thinking of you"
        case .candle: "Here if you want me. No pressure."
        case .moon: "Rest well"
        case .seed: "No need to do anything"
        }
    }
}

public struct LoveNote: Codable, Equatable, Identifiable, Sendable {
    public static let maxPerDay = 3
    public static let maxNoteLength = 80

    public var id: UUID
    public var from: UserID
    public var to: UserID
    public var kind: LoveKind
    public var note: String
    public var createdAt: Date

    public init(id: UUID = UUID(), from: UserID, to: UserID, kind: LoveKind, note: String = "", createdAt: Date = Date()) {
        self.id = id
        self.from = from
        self.to = to
        self.kind = kind
        self.note = note
        self.createdAt = createdAt
    }
}

// MARK: - "What helps" cards

public struct HelpCard: Codable, Equatable, Sendable {
    /// "*" = general card; otherwise a mood title (matched case-insensitively).
    public var mood: String
    public var text: String

    public static let general = "*"
    public static let maxCards = 30

    public init(mood: String, text: String) {
        self.mood = mood
        self.text = text
    }

    /// Port of pickHelpText(): specific card for the mood, else the general one.
    public static func pick(from cards: [HelpCard], for mood: String) -> String? {
        let key = mood.trimmingCharacters(in: .whitespaces).lowercased()
        let spec = cards.first { $0.mood.trimmingCharacters(in: .whitespaces).lowercased() == key }
        let gen = cards.first { $0.mood == general }
        return (spec ?? gen)?.text
    }

    /// Port of sanitizeHelps(): trim, clamp lengths, dedupe by mood, cap at 30.
    public static func sanitize(_ cards: [HelpCard]) -> [HelpCard] {
        var seen = Set<String>()
        var out: [HelpCard] = []
        for c in cards {
            let m = String(c.mood.trimmingCharacters(in: .whitespacesAndNewlines).prefix(80))
            let t = String(c.text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(240))
            guard !m.isEmpty, !t.isEmpty, seen.insert(m.lowercased()).inserted else { continue }
            out.append(HelpCard(mood: m, text: t))
            if out.count >= maxCards { break }
        }
        return out
    }
}
