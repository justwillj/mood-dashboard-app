import XCTest
@testable import MoodCore

final class JSONMoodStoreTests: XCTestCase {
    func makeStore() throws -> JSONMoodStore {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        return try JSONMoodStore(me: "dylan", directory: dir,
                                 seed: .demo(me: "dylan", partner: Friend(id: "will", name: "Will")))
    }

    // MARK: Existing

    func testSeedAndLatest() async throws {
        let s = try makeStore()
        let (mine, theirs) = try await s.latest(in: "will")
        XCTAssertNotNil(mine); XCTAssertNotNil(theirs)
    }

    func testEditSetsEditedAtAndKeepsCreatedAt() async throws {
        let s = try makeStore()
        var c = try await s.latest(in: "will").mine!
        let created = c.createdAt
        c.note = "updated"
        let saved = try await s.save(c)
        XCTAssertEqual(saved.createdAt, created)
        XCTAssertNotNil(saved.editedAt)
    }

    func testCannotEditTheirs() async throws {
        let s = try makeStore()
        let theirs = try await s.latest(in: "will").theirs!
        do { try await s.save(theirs); XCTFail() } catch { XCTAssertEqual(error as? MoodStoreError, .notAuthor) }
    }

    func testLoveLimit() async throws {
        let s = try makeStore()
        for _ in 0..<LoveNote.maxPerDay { try await s.send(.init(from: "dylan", to: "will", kind: .hug)) }
        do { try await s.send(.init(from: "dylan", to: "will", kind: .hug)); XCTFail() }
        catch { XCTAssertEqual(error as? MoodStoreError, .loveLimitReached) }
    }

    func testChangesStream() async throws {
        let s = try makeStore()
        let stream = await s.changes()
        try await s.save(CheckIn(authorID: "dylan", mood: "☕ Cozy", sharedWith: ["will"]))
        var it = stream.makeAsyncIterator()
        let first = await it.next()
        XCTAssertEqual(first, .checkIns)
    }

    // MARK: Delete

    func testDeleteMineFallsBackToOlder() async throws {
        let s = try makeStore()
        let latest = try await s.latest(in: "will")
        let newest = try XCTUnwrap(latest.mine)

        try await s.deleteCheckIn(id: newest.id)

        let after = try await s.latest(in: "will")
        let fallback = try XCTUnwrap(after.mine)
        XCTAssertNotEqual(fallback.id, newest.id)
        XCTAssertLessThan(fallback.createdAt, newest.createdAt)

        let all = try await s.checkIns(in: "will", limit: nil)
        XCTAssertFalse(all.contains { $0.id == newest.id })
        // Their side is untouched.
        XCTAssertEqual(after.theirs?.id, latest.theirs?.id)
    }

    func testCannotDeleteTheirs() async throws {
        let s = try makeStore()
        let latest = try await s.latest(in: "will")
        let theirs = try XCTUnwrap(latest.theirs)

        do { try await s.deleteCheckIn(id: theirs.id); XCTFail("should throw") }
        catch { XCTAssertEqual(error as? MoodStoreError, .notAuthor) }

        // Still there.
        let all = try await s.checkIns(in: "will", limit: nil)
        XCTAssertTrue(all.contains { $0.id == theirs.id })
    }

    func testDeleteUnknownIDThrowsNotFound() async throws {
        let s = try makeStore()
        do { try await s.deleteCheckIn(id: UUID()); XCTFail("should throw") }
        catch { XCTAssertEqual(error as? MoodStoreError, .notFound) }
    }

    // MARK: Edit to Resting

    func testEditToRestingClearsMoodAndEnergy() async throws {
        let s = try makeStore()
        let latest = try await s.latest(in: "will")
        var c = try XCTUnwrap(latest.mine)

        // Precondition: the seeded entry has a mood and a resolvable energy.
        XCTAssertFalse(c.mood.isEmpty)
        XCTAssertNotNil(c.energy(presets: MoodPreset.defaults))

        c.isResting = true
        let saved = try await s.save(c)

        XCTAssertEqual(saved.id, c.id)
        XCTAssertTrue(saved.isResting)
        XCTAssertEqual(saved.mood, "")
        XCTAssertNil(saved.capacity.energy)
        XCTAssertNil(saved.energy(presets: MoodPreset.defaults))
        XCTAssertNotNil(saved.editedAt)

        // And it persisted, not just the returned copy.
        let reloaded = try await s.latest(in: "will")
        let stored = try XCTUnwrap(reloaded.mine)
        XCTAssertEqual(stored.id, c.id)
        XCTAssertTrue(stored.isResting)
        XCTAssertEqual(stored.mood, "")
        XCTAssertNil(stored.energy(presets: MoodPreset.defaults))
    }
}