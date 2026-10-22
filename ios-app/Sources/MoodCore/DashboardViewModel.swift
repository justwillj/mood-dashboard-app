import Foundation
import Observation

public struct TrendPair: Equatable, Sendable {
    public let me: TrendSummary
    public let them: TrendSummary
}

/// Single source of truth for the dashboard screen.
/// Views read state; they call the action methods; they never touch the store.
/// CONTRACT: every MoodStore must emit `changes()` for local writes too,
/// because this view model reloads only from that stream.
@MainActor @Observable
public final class DashboardViewModel {
    // MARK: State (read by views)
    public private(set) var friends: [Friend] = []
    public private(set) var selectedFriend: Friend?
    public private(set) var mine: CheckIn?
    public private(set) var theirs: CheckIn?
    public private(set) var history: [CheckIn] = []
    public private(set) var incomingLove: [LoveNote] = []
    public private(set) var lovesSentToday = 0
    public private(set) var helpText: String?
    public private(set) var trends: [Int: TrendPair] = [:]   // keys: 14, 28
    public private(set) var errorMessage: String?
    /// TODO: move into a preset store once the manager screen is ported.
    public var presets: [MoodPreset] = MoodPreset.defaults

    // MARK: Derived
    public var theme: Theme { settings.activeTheme }
    public var theirsResting: Bool { theirs?.isResting ?? false }
    public var theirsStale: Bool {
        guard let t = theirs, !t.isResting else { return false }
        return now().timeIntervalSince(t.createdAt) > 86_400
    }
    public var myAlert: LowEnergyAlert? { mine?.isResting == true ? nil : trends[14]?.me.alert }
    public var theirAlert: LowEnergyAlert? { theirsResting ? nil : trends[14]?.them.alert }
    public var canSendLove: Bool { lovesSentToday < LoveNote.maxPerDay }

    // MARK: Wiring
    @ObservationIgnored private let store: any MoodStore
    @ObservationIgnored private let settings: SettingsStore
    @ObservationIgnored private let now: @Sendable () -> Date
    @ObservationIgnored private var listenTask: Task<Void, Never>?
    @ObservationIgnored private var reloadTask: Task<Void, Never>?
    private static let restingHelpKey = "🌙 Resting"

    public init(store: any MoodStore, settings: SettingsStore, now: @escaping @Sendable () -> Date = { Date() }) {
        self.store = store
        self.settings = settings
        self.now = now
    }

    /// Call from `.task {}`. Safe to call twice.
    public func start() {
        guard listenTask == nil else { return }
        trackSelection()
        let store = store
        listenTask = Task { [weak self] in
            for await _ in await store.changes() { self?.scheduleReload() }
        }
        scheduleReload()
    }

    public func stop() {
        listenTask?.cancel(); listenTask = nil
        reloadTask?.cancel(); reloadTask = nil
    }

    // MARK: Observing SettingsStore
    // onChange fires *before* the value changes, so we hop to a Task and
    // re-arm (withObservationTracking is one-shot).
    private func trackSelection() {
        withObservationTracking {
            _ = settings.selectedFriendID
        } onChange: { [weak self] in
            Task { @MainActor in
                self?.scheduleReload()
                self?.trackSelection()
            }
        }
    }

    // MARK: Loading
    private func scheduleReload() {
        reloadTask?.cancel()
        reloadTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(100))   // coalesce bursts
            guard !Task.isCancelled else { return }
            await self?.reload()
        }
    }

    public func reload() async {
        do {
            let me = store.me
            let all = try await store.friends()
            let friend = all.first { $0.id == settings.selectedFriendID } ?? all.first
            guard let friend else {
                friends = all; selectedFriend = nil; mine = nil; theirs = nil
                history = []; incomingLove = []; helpText = nil; trends = [:]
                return
            }
            async let hist = store.checkIns(in: friend.id, limit: nil)
            async let love = store.loveNotes(in: friend.id, since: now().addingTimeInterval(-2 * 86_400))
            async let cards = store.helps(of: friend.id)
            let (h, l, c) = try await (hist, love, cards)
            guard !Task.isCancelled else { return }

            let t = now()
            let theirsLatest = h.first { $0.authorID == friend.id }
            friends = all
            selectedFriend = friend
            history = h
            mine = h.first { $0.authorID == me }
            theirs = theirsLatest
            incomingLove = Array(l.filter { $0.from == friend.id && !settings.isLoveHidden($0.id) }.prefix(2))
            lovesSentToday = l.filter { $0.from == me && $0.createdAt > t.addingTimeInterval(-86_400) }.count
            helpText = theirsLatest.flatMap {
                HelpCard.pick(from: c, for: $0.isResting ? Self.restingHelpKey : $0.mood)
            }
            trends = Dictionary(uniqueKeysWithValues: [14, 28].map { r in
                (r, TrendPair(
                    me: Trends.summarize(h, by: me, presets: presets, days: r, now: t),
                    them: Trends.summarize(h, by: friend.id, presets: presets, days: r, now: t)))
            })
            errorMessage = nil
        } catch {
            errorMessage = Self.message(for: error)
        }
    }

    // MARK: Actions (the store's change stream triggers the refresh)
    public func select(_ friend: Friend) { settings.selectFriend(friend.id) }
    public func cycleTheme() { settings.cycleTheme() }
    public func hideLove(_ id: UUID) { settings.hideLove(id); scheduleReload() }

    /// `preset == nil` logs "Resting".
    public func logMood(_ preset: MoodPreset?, note: String = "", noReply: Bool = false,
                        need: Need? = nil, capacity: Capacity = .init(),
                        sharedWith: Set<UserID>? = nil) async {
        await run {
            var cap = capacity
            if let p = preset { cap.energy = p.energy }
            let to = try await recipients(sharedWith)
            _ = try await store.save(CheckIn(
                authorID: store.me, mood: preset?.title ?? "", isResting: preset == nil,
                note: note, noReply: noReply, need: need, capacity: cap, sharedWith: to))
        }
    }

    public func logSameAsLast(sharedWith: Set<UserID>? = nil) async {
        guard let last = mine else { return }
        await run {
            let to = try await recipients(sharedWith)
            _ = try await store.save(CheckIn(
                authorID: store.me, mood: last.mood, isResting: last.isResting, note: last.note,
                noReply: last.noReply, need: last.need, capacity: last.capacity, sharedWith: to))
        }
    }

    public func saveEdit(_ checkIn: CheckIn) async { await run { _ = try await store.save(checkIn) } }
    public func delete(_ id: UUID) async { await run { try await store.deleteCheckIn(id: id) } }
    public func saveMyHelps(_ cards: [HelpCard]) async { await run { try await store.saveHelps(cards) } }

    public func sendLove(_ kind: LoveKind, note: String = "") async {
        guard let f = selectedFriend else { return }
        await run { try await store.send(LoveNote(from: store.me, to: f.id, kind: kind, note: note)) }
    }

    // MARK: Helpers
    private func recipients(_ explicit: Set<UserID>?) async throws -> Set<UserID> {
        if let explicit, !explicit.isEmpty { return explicit }
        guard let f = selectedFriend else { throw MoodStoreError.invalid("Add a friend first") }
        return try await store.defaultShareTargets(fallback: f.id)
    }

    private func run(_ op: () async throws -> Void) async {
        do { try await op(); errorMessage = nil }
        catch { errorMessage = Self.message(for: error) }
    }

    private static func message(for error: Error) -> String {
        switch error as? MoodStoreError {
        case .loveLimitReached: "That is plenty for today. They will feel it."
        case .notAuthor: "You can only change your own check-ins."
        case .notFound: "That entry no longer exists."
        case .invalid(let m): m
        case nil: "Something went wrong. Please try again."
        }
    }
}
