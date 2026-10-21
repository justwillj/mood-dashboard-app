import Foundation

/// Local, file-backed MoodStore. One JSON file, atomic writes.
/// Point `directory` at the App Group container so the widget extension can read it.
public actor JSONMoodStore: MoodStore {
    public struct Snapshot: Codable, Sendable {
        public var friends: [Friend] = []
        public var checkIns: [CheckIn] = []
        public var love: [LoveNote] = []
        public var helps: [UserID: [HelpCard]] = [:]
        public init() {}
    }

    public nonisolated let me: UserID

    private let fileURL: URL
    private let now: @Sendable () -> Date
    private var data: Snapshot
    private var listeners: [UUID: AsyncStream<StoreChange>.Continuation] = [:]

    /// `seed` is used only when no file exists yet (demo mode, tests).
    public init(
        me: UserID,
        directory: URL,
        fileName: String = "mood-store.json",
        seed: Snapshot? = nil,
        now: @escaping @Sendable () -> Date = { Date() }
    ) throws {
        self.me = me
        self.now = now
        self.fileURL = directory.appendingPathComponent(fileName)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        if let raw = try? Data(contentsOf: fileURL) {
            let dec = JSONDecoder()
            dec.dateDecodingStrategy = .iso8601
            self.data = try dec.decode(Snapshot.self, from: raw)
        } else {
            self.data = seed ?? Snapshot()
            try Self.write(self.data, to: fileURL)
        }
    }

    /// Shared container for app + widget. Returns nil if the App Group isn't set up.
    public static func appGroupDirectory(_ groupID: String) -> URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID)
    }

    // MARK: Friends

    public func friends() -> [Friend] { data.friends }

    public func saveFriend(_ friend: Friend) throws {
        let name = friend.name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty, friend.id != me else { throw MoodStoreError.invalid("Bad friend") }
        var f = friend
        f.name = String(name.prefix(40))
        if let i = data.friends.firstIndex(where: { $0.id == f.id }) {
            data.friends[i] = f
        } else {
            data.friends.append(f)
        }
        try commit(.friends)
    }

    public func deleteFriend(id: UserID) throws {
        guard data.friends.contains(where: { $0.id == id }) else { throw MoodStoreError.notFound }
        data.friends.removeAll { $0.id == id }
        try commit(.friends)
    }

    // MARK: Check-ins

    public func checkIns(in friend: UserID, limit: Int?) -> [CheckIn] {
        let list = data.checkIns
            .filter { visible($0, in: friend) }
            .sorted { $0.createdAt > $1.createdAt }
        return limit.map { Array(list.prefix($0)) } ?? list
    }

    @discardableResult
    public func save(_ checkIn: CheckIn) throws -> CheckIn {
        guard checkIn.authorID == me else { throw MoodStoreError.notAuthor }
        guard !checkIn.sharedWith.isEmpty else { throw MoodStoreError.invalid("Share with at least one friend") }
        guard checkIn.isResting || !checkIn.mood.isEmpty else { throw MoodStoreError.invalid("Pick a mood") }

        var c = checkIn
        c.note = String(c.note.trimmingCharacters(in: .whitespacesAndNewlines).prefix(CheckIn.maxNoteLength))
        if c.isResting { c.mood = ""; c.capacity.energy = nil }

        if let i = data.checkIns.firstIndex(where: { $0.id == c.id }) {
            guard data.checkIns[i].authorID == me else { throw MoodStoreError.notAuthor }
            c.createdAt = data.checkIns[i].createdAt
            c.editedAt = now()
            data.checkIns[i] = c
        } else {
            c.createdAt = now()
            c.editedAt = nil
            data.checkIns.append(c)
        }
        try commit(.checkIns)
        return c
    }

    public func deleteCheckIn(id: UUID) throws {
        guard let i = data.checkIns.firstIndex(where: { $0.id == id }) else { throw MoodStoreError.notFound }
        guard data.checkIns[i].authorID == me else { throw MoodStoreError.notAuthor }
        data.checkIns.remove(at: i)
        try commit(.checkIns)
    }

    // MARK: Love

    public func loveNotes(in friend: UserID, since: Date) -> [LoveNote] {
        data.love
            .filter { ($0.from == me && $0.to == friend) || ($0.from == friend && $0.to == me) }
            .filter { $0.createdAt >= since }
            .sorted { $0.createdAt > $1.createdAt }
    }

    public func send(_ love: LoveNote) throws {
        guard love.from == me else { throw MoodStoreError.notAuthor }
        let cutoff = now().addingTimeInterval(-86_400)
        let sent = data.love.filter { $0.from == me && $0.to == love.to && $0.createdAt > cutoff }.count
        guard sent < LoveNote.maxPerDay else { throw MoodStoreError.loveLimitReached }

        var l = love
        l.note = String(l.note.trimmingCharacters(in: .whitespacesAndNewlines).prefix(LoveNote.maxNoteLength))
        l.createdAt = now()
        data.love.append(l)
        // Housekeeping (as in saveLoveFromUrl): drop my notes older than 14 days.
        let old = now().addingTimeInterval(-14 * 86_400)
        data.love.removeAll { $0.from == me && $0.createdAt < old }
        try commit(.love)
    }

    // MARK: Helps

    public func helps(of author: UserID) -> [HelpCard] { data.helps[author] ?? [] }

    public func saveHelps(_ cards: [HelpCard]) throws {
        let clean = HelpCard.sanitize(cards)
        if clean.isEmpty { data.helps[me] = nil } else { data.helps[me] = clean }
        try commit(.helps)
    }

    // MARK: Updates

    public func changes() -> AsyncStream<StoreChange> {
        let (stream, continuation) = AsyncStream.makeStream(of: StoreChange.self)
        let id = UUID()
        listeners[id] = continuation
        continuation.onTermination = { [weak self] _ in
            Task { await self?.removeListener(id) }
        }
        return stream
    }

    // MARK: Internals

    private func removeListener(_ id: UUID) { listeners[id] = nil }

    private func visible(_ c: CheckIn, in friend: UserID) -> Bool {
        (c.authorID == me && c.sharedWith.contains(friend))
            || (c.authorID == friend && c.sharedWith.contains(me))
    }

    private func commit(_ change: StoreChange) throws {
        try Self.write(data, to: fileURL)
        for l in listeners.values { l.yield(change) }
    }

    private static func write(_ snapshot: Snapshot, to url: URL) throws {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.prettyPrinted, .sortedKeys]
        try enc.encode(snapshot).write(to: url, options: .atomic)
    }
}
