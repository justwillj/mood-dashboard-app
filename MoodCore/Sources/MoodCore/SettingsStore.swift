import Foundation
import Observation

public enum SettingsKeys {
    /// Must match the App Group on BOTH the app and widget targets.
    public static let suite = "group.com.you.mood"
    static let theme = "activeTheme"
    static let friend = "selectedFriendID"
    static let hiddenLove = "hiddenLoveNoteIDs"
    static let hiddenLoveCap = 200

    /// Falls back to `.standard` (NOT shared with widgets) if the App Group is missing.
    public static func sharedDefaults() -> UserDefaults {
        UserDefaults(suiteName: suite) ?? .standard
    }
}

/// Plain value readable from anywhere, including widget timeline providers
/// (no MainActor needed).
public struct SettingsSnapshot: Sendable, Equatable {
    public var themeID: String
    public var selectedFriendID: UserID?
    public var hiddenLoveNoteIDs: [UUID]   // oldest -> newest

    public var theme: Theme { Theme.named(themeID) }

    public static func read(from defaults: UserDefaults = SettingsKeys.sharedDefaults()) -> SettingsSnapshot {
        SettingsSnapshot(
            themeID: Theme.named(defaults.string(forKey: SettingsKeys.theme)).id,
            selectedFriendID: defaults.string(forKey: SettingsKeys.friend),
            hiddenLoveNoteIDs: (defaults.stringArray(forKey: SettingsKeys.hiddenLove) ?? []).compactMap(UUID.init)
        )
    }
}

/// Local, per-device UI preferences. Not synced between people.
/// Properties are `private(set)` with explicit mutators (instead of didSet)
/// because @Observable rewrites stored properties.
@MainActor @Observable
public final class SettingsStore {
    public private(set) var activeThemeID: String
    public private(set) var selectedFriendID: UserID?
    public private(set) var hiddenLoveNoteIDs: [UUID]

    @ObservationIgnored private let defaults: UserDefaults

    public var activeTheme: Theme { Theme.named(activeThemeID) }

    public init(defaults: UserDefaults = SettingsKeys.sharedDefaults()) {
        self.defaults = defaults
        let s = SettingsSnapshot.read(from: defaults)
        activeThemeID = s.themeID
        selectedFriendID = s.selectedFriendID
        hiddenLoveNoteIDs = s.hiddenLoveNoteIDs
    }

    public func setTheme(_ id: String) {
        activeThemeID = Theme.named(id).id
        defaults.set(activeThemeID, forKey: SettingsKeys.theme)
    }

    public func cycleTheme() { setTheme(activeTheme.next().id) }

    public func selectFriend(_ id: UserID?) {
        selectedFriendID = id
        if let id { defaults.set(id, forKey: SettingsKeys.friend) }
        else { defaults.removeObject(forKey: SettingsKeys.friend) }
    }

    public func isLoveHidden(_ id: UUID) -> Bool { hiddenLoveNoteIDs.contains(id) }

    public func hideLove(_ id: UUID) {
        guard !hiddenLoveNoteIDs.contains(id) else { return }
        hiddenLoveNoteIDs = Array((hiddenLoveNoteIDs + [id]).suffix(SettingsKeys.hiddenLoveCap))
        defaults.set(hiddenLoveNoteIDs.map(\.uuidString), forKey: SettingsKeys.hiddenLove)
    }

    /// Call on scene activation: a widget intent may have changed the values.
    public func reloadFromDisk() {
        let s = SettingsSnapshot.read(from: defaults)
        activeThemeID = s.themeID
        selectedFriendID = s.selectedFriendID
        hiddenLoveNoteIDs = s.hiddenLoveNoteIDs
    }
}
