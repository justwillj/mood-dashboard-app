import XCTest
@testable import MoodCore

final class TrendsTests: XCTestCase {
    let now = ISO8601DateFormatter().date(from: "2026-10-21T12:00:00Z")!
    let cal: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "UTC")!
        return c
    }()
    let presets = MoodPreset.defaults

    /// A check-in `ago` days before `now` (noon UTC), optionally some hours earlier.
    func ci(_ ago: Int, hoursEarlier: Double = 0, mood: String = "x", energy: Int? = nil,
            resting: Bool = false, social: Int? = nil, sensory: Int? = nil,
            talk: TalkPreference? = nil, author: UserID = "me") -> CheckIn {
        CheckIn(authorID: author, mood: mood, isResting: resting,
                capacity: Capacity(energy: energy, social: social, sensory: sensory, talk: talk),
                sharedWith: ["them"],
                createdAt: now.addingTimeInterval(-Double(ago) * 86_400 - hoursEarlier * 3_600))
    }

    func sum(_ items: [CheckIn], days: Int = 14, author: UserID = "me") -> TrendSummary {
        Trends.summarize(items, by: author, presets: presets, days: days, now: now, calendar: cal)
    }

    func testDayBucketsAndLabels() {
        let s = sum([ci(0, energy: 3), ci(2, energy: 4)])
        XCTAssertEqual(s.days.count, 14)
        XCTAssertEqual(s.days[13].label, "Oct 21")
        XCTAssertEqual(s.days[11].label, "Oct 19")
        XCTAssertEqual(s.days[13].count, 1)
        XCTAssertEqual(s.days[12].count, 0)
    }

    func testSameDayAveraging() {
        let s = sum([ci(0, energy: 2), ci(0, hoursEarlier: 1, energy: 4)])
        XCTAssertEqual(s.days[13].count, 2)
        XCTAssertEqual(s.days[13].energy, 3.0)
    }

    func testRestingDay() {
        let s = sum([ci(0, resting: true), ci(1, energy: 3)])
        XCTAssertTrue(s.days[13].resting)
        XCTAssertNil(s.days[13].energy)
        XCTAssertEqual(s.stats.restingDays, 1)
        XCTAssertEqual(s.stats.daysWithEnergy, 1)
        XCTAssertEqual(s.stats.checkinDays, 2)
    }

    func testPresetFallbackForEnergy() {
        let s = sum([ci(0, mood: "🔴 Low Battery")])
        XCTAssertEqual(s.days[13].energy, 1.0)
    }

    func testStats() {
        let s = sum([
            ci(0, energy: 4, social: 2, talk: TalkPreference.none),
            ci(1, energy: 2, social: 4),
            ci(20, energy: 5),               // previous window
        ])
        let st = s.stats
        XCTAssertEqual(st.checkinDays, 2)
        XCTAssertEqual(st.totalDays, 14)
        XCTAssertEqual(st.avgEnergy, 3.0)
        XCTAssertEqual(st.prevAvgEnergy, 5.0)
        XCTAssertEqual(st.lowDays, 1)
        XCTAssertEqual(st.daysWithEnergy, 2)
        XCTAssertEqual(st.avgSocial, 3.0)
        XCTAssertEqual(st.socialSamples, 2)
        XCTAssertNil(st.avgSensory)
        XCTAssertEqual(st.noTalkDays, 1)
        XCTAssertEqual(st.restingDays, 0)
    }

    func testRangeSizes() {
        let items = [ci(15, energy: 3)]
        XCTAssertEqual(sum(items, days: 14).stats.checkinDays, 0)
        let s28 = sum(items, days: 28)
        XCTAssertEqual(s28.days.count, 28)
        XCTAssertEqual(s28.days[12].count, 1)   // 27 - 15
    }

    func testIgnoresOtherAuthors() {
        let s = sum([ci(0, energy: 5, author: "them")])
        XCTAssertEqual(s.stats.checkinDays, 0)
    }

    func testAlertFires() {
        let s = sum([ci(0, energy: 1), ci(1, energy: 2), ci(2, energy: 1)])
        XCTAssertEqual(s.alert, LowEnergyAlert(low: 3, days: 7))
    }

    func testAlertNeedsThreeLowDays() {
        XCTAssertNil(sum([ci(0, energy: 1), ci(1, energy: 1)]).alert)
    }

    func testAlertNeedsSixtyPercent() {
        // 3 low of 6 days with energy = 50% -> no alert
        let items = [ci(0, energy: 1), ci(1, energy: 1), ci(2, energy: 1),
                     ci(3, energy: 5), ci(4, energy: 5), ci(5, energy: 5)]
        XCTAssertNil(sum(items).alert)
    }

    func testAlertIgnoresOlderThanSevenDays() {
        let items = [ci(7, energy: 1), ci(8, energy: 1), ci(9, energy: 1)]
        XCTAssertNil(sum(items).alert)
    }

    func testLowEnergyAlertHelperMatchesSummary() {
        let items = [ci(0, energy: 1), ci(1, energy: 1), ci(2, energy: 1)]
        XCTAssertEqual(
            Trends.lowEnergyAlert(items, by: "me", presets: presets, now: now, calendar: cal),
            sum(items, days: 7).alert)
    }
}
