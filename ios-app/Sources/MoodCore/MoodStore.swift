import Foundation

public enum StoreChange: Sendable, Equatable {
    case friends, checkIns, love, helps
}

public enum MoodStoreError: Error, Equatable {
    case notFound
    case notAuthor          // tried to edit/delete someone else's entry
    case invalid(String)
    case loveLimitReached   // LoveNote.maxPerDay per friend per rolling 24h
}

/// The seam between UI/widgets and any backend.
/// Implementations: JSONMoodStore (local), later EventKitStore / CloudKitStore.
/// All views and view models depend only on this protocol.
public protocol MoodStore: Sendable {
    /// The signed-in user.
    var me: UserID { get }

    // Friends (each friend = one private circle)
    func friends() async throws -> [Friend]
    func saveFriend(_ friend: Friend) async throws          // upsert by id
    func deleteFriend(id: UserID) async throws

    // Check-ins
    /// Everything visible in the circle with `friend` (mine shared with them,
    /// theirs shared with me), newest first.
    func checkIns(in friend: UserID, limit: Int?) async throws -> [CheckIn]
    /// Insert, or edit if the id exists (author only; sets `editedAt`).
    @discardableResult
    func save(_ checkIn: CheckIn) async throws -> CheckIn
    func deleteCheckIn(id: UUID) async throws               // author only

    // Love
    func loveNotes(in friend: UserID, since: Date) async throws -> [LoveNote]
    func send(_ love: LoveNote) async throws                // enforces daily cap

    // "What helps" cards
    func helps(of author: UserID) async throws -> [HelpCard]
    func saveHelps(_ cards: [HelpCard]) async throws        // mine; empty removes

    /// Emits whenever data changes. Widgets/views re-fetch on each event.
    /// Later: CloudKit push, EKEventStoreChanged.
    func changes() async -> AsyncStream<StoreChange>
}

public extension MoodStore {
    /// Port of latestCheckins(): newest check-in from me and from them.
    func latest(in friend: UserID) async throws -> (mine: CheckIn?, theirs: CheckIn?) {
        let all = try await checkIns(in: friend, limit: nil)
        return (all.first { $0.authorID == me }, all.first { $0.authorID == friend })
    }

    /// Port of defaultTargets(): friends who get new check-ins by default.
    func defaultShareTargets(fallback: UserID) async throws -> Set<UserID> {
        let auto = try await friends().filter(\.autoShare).map(\.id)
        return auto.isEmpty ? [fallback] : Set(auto)
    }
}
