import Foundation

public struct TrendDay: Equatable, Sendable {
    public let label: String      // "Oct 21"
    public let count: Int         // check-ins that day
    public let energy: Double?    // day average (1 decimal); nil if none/resting-only
    public let resting: Bool
}

public struct TrendStats: Equatable, Sendable {
    public let checkinDays: Int
    public let totalDays: Int
    public let avgEnergy: Double?
    public let prevAvgEnergy: Double?   // same-length window before this one
    public let lowDays: Int
    public let daysWithEnergy: Int
    public let restingDays: Int
    public let avgSocial: Double?
    public let socialSamples: Int
    public let avgSensory: Double?
    public let sensorySamples: Int
    public let noTalkDays: Int
}

public struct LowEnergyAlert: Equatable, Sendable {
    public let low: Int
    public let days: Int
}

public struct TrendSummary: Equatable, Sendable {
    public let days: [TrendDay]
    public let stats: TrendStats
    public let alert: LowEnergyAlert?   // always about the last 7 days
}

/// Pure ports of summarizeTrend / lowEnergyInfo. `now` and `calendar` are
/// injectable so tests are deterministic.
public enum Trends {
    public static let lowEnergyThreshold = 2
    public static let alertWindow = 7

    private static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    private struct Day {
        let label: String
        let count: Int
        let energy: Double?
        let resting: Bool
        let social: [Int]
        let sensory: [Int]
        let noTalk: Bool
    }

    /// `days` = how many days to chart (14 or 28). Only `author`'s check-ins count.
    public static func summarize(
        _ checkIns: [CheckIn],
        by author: UserID,
        presets: [MoodPreset],
        days R: Int,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> TrendSummary {
        let R = max(1, R)
        let mine = checkIns.filter { $0.authorID == author }
        let today = calendar.startOfDay(for: now)
        let groups = Dictionary(grouping: mine) { calendar.startOfDay(for: $0.createdAt) }

        func day(_ offset: Int) -> Day {
            let d = calendar.startOfDay(for: calendar.date(byAdding: .day, value: -offset, to: today) ?? today)
            let g = groups[d] ?? []
            let es = g.compactMap { $0.energy(presets: presets) }.map(Double.init)
            return Day(
                label: "\(months[calendar.component(.month, from: d) - 1]) \(calendar.component(.day, from: d))",
                count: g.count,
                energy: round1(mean(es)),
                resting: g.contains { $0.isResting },
                social: g.compactMap { $0.capacity.social },
                sensory: g.compactMap { $0.capacity.sensory },
                noTalk: g.contains { $0.capacity.talk == TalkPreference.none }
            )
        }

        let cur = (0..<R).reversed().map(day)
        let prev = (R..<(2 * R)).reversed().map(day)
        let last7 = (0..<alertWindow).reversed().map(day)

        func isLow(_ d: Day) -> Bool { d.energy.map { $0 <= Double(lowEnergyThreshold) } ?? false }
        func withEnergy(_ a: [Day]) -> [Day] { a.filter { $0.energy != nil } }

        let low7 = last7.filter(isLow).count
        let withE7 = withEnergy(last7).count
        let alert = (low7 >= 3 && withE7 > 0 && Double(low7) >= 0.6 * Double(withE7))
            ? LowEnergyAlert(low: low7, days: alertWindow) : nil

        let soc = cur.flatMap(\.social).map(Double.init)
        let sen = cur.flatMap(\.sensory).map(Double.init)
        let prevE = withEnergy(prev).compactMap(\.energy)

        return TrendSummary(
            days: cur.map { TrendDay(label: $0.label, count: $0.count, energy: $0.energy, resting: $0.resting) },
            stats: TrendStats(
                checkinDays: cur.filter { $0.count > 0 }.count,
                totalDays: R,
                avgEnergy: round1(mean(withEnergy(cur).compactMap(\.energy))),
                prevAvgEnergy: prevE.isEmpty ? nil : round1(mean(prevE)),
                lowDays: cur.filter(isLow).count,
                daysWithEnergy: withEnergy(cur).count,
                restingDays: cur.filter(\.resting).count,
                avgSocial: round1(mean(soc)), socialSamples: soc.count,
                avgSensory: round1(mean(sen)), sensorySamples: sen.count,
                noTalkDays: cur.filter(\.noTalk).count
            ),
            alert: alert
        )
    }

    /// "Low lately": 3+ low-energy days in the last 7 AND at least 60% of the
    /// days that have an energy value. Same rule the dashboard banner and widgets use.
    public static func lowEnergyAlert(
        _ checkIns: [CheckIn],
        by author: UserID,
        presets: [MoodPreset],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> LowEnergyAlert? {
        summarize(checkIns, by: author, presets: presets, days: alertWindow, now: now, calendar: calendar).alert
    }

    private static func mean(_ a: [Double]) -> Double? {
        a.isEmpty ? nil : a.reduce(0, +) / Double(a.count)
    }

    private static func round1(_ n: Double?) -> Double? {
        n.map { ($0 * 10).rounded() / 10 }
    }
}
