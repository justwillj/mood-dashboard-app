import XCTest
@testable import MoodCore

final class JSONMoodStoreTests: XCTestCase {
    func makeStore() throws -> JSONMoodStore {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        return try JSONMoodStore(me: "dylan", directory: dir,
                                 seed: .demo(me: "dylan", partner: Friend(id: "will", name: "Will")))
    }

    func testSeedAndLatest() async throws {
        let s = try await makeStore()
        let (mine, theirs) = try await s.latest(in: "will")
        XCTAssertNotNil(mine); XCTAssertNotNil(theirs)
    }

    func testEditSetsEditedAtAndKeepsCreatedAt() async throws {
        let s = try await makeStore()
        var c = try await s.latest(in: "will").mine!
        let created = c.createdAt
        c.note = "updated"
        let saved = try await s.save(c)
        XCTAssertEqual(saved.createdAt, created)
        XCTAssertNotNil(saved.editedAt)
    }

    func testCannotEditTheirs() async throws {
        let s = try await makeStore()
        let theirs = try await s.latest(in: "will").theirs!
        do { try await s.save(theirs); XCTFail() } catch { XCTAssertEqual(error as? MoodStoreError, .notAuthor) }
    }

    func testLoveLimit() async throws {
        let s = try await makeStore()
        for _ in 0..<LoveNote.maxPerDay { try await s.send(.init(from: "dylan", to: "will", kind: .hug)) }
        do { try await s.send(.init(from: "dylan", to: "will", kind: .hug)); XCTFail() }
        catch { XCTAssertEqual(error as? MoodStoreError, .loveLimitReached) }
    }

    func testChangesStream() async throws {
        let s = try await makeStore()
        let stream = await s.changes()
        try await s.save(CheckIn(authorID: "dylan", mood: "☕ Cozy", sharedWith: ["will"]))
        var it = stream.makeAsyncIterator()
        let first = await it.next()
        XCTAssertEqual(first, .checkIns)
    }
}
