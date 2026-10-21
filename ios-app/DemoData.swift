import Foundation

/// Sample data for previews, tests and the App Review demo path
/// (port of buildMockData()).
public extension JSONMoodStore.Snapshot {
    static func demo(me: UserID, partner: Friend, now: Date = Date()) -> Self {
        var s = Self()
        s.friends = [partner]

        let presets = MoodPreset.defaults
        let notes = ["Long day at work", "Weekend unwind", "", "Rainy day reset", "Cooking something new", "Sprint wrap-up"]
        let needs: [Need?] = [nil, .space, nil, .comfort, nil, .parallel]
        let talks: [TalkPreference] = [.ok, .text, .none]

        for day in 0..<28 {
            for who in 0..<2 {
                let n = day * 2 + who
                let preset = presets[(n * 5 + day) % presets.count]
                let mine = who == 0
                let cap = n % 3 == 0
                    ? Capacity(energy: preset.energy)
                    : Capacity(energy: preset.energy, social: n % 5 + 1, sensory: (n * 2) % 5 + 1, talk: talks[n % 3])
                s.checkIns.append(CheckIn(
                    authorID: mine ? me : partner.id,
                    mood: preset.title,
                    note: notes[n % notes.count],
                    noReply: n % 7 == 0,
                    need: needs[n % needs.count],
                    capacity: cap,
                    sharedWith: [mine ? partner.id : me],
                    createdAt: now.addingTimeInterval(-(Double(day) * 86_400 + Double(who + 1) * 3_600))
                ))
            }
        }

        s.love = [LoveNote(from: partner.id, to: me, kind: .tea, note: "Hope today is gentle",
                           createdAt: now.addingTimeInterval(-7_200))]
        s.helps[partner.id] = [
            HelpCard(mood: HelpCard.general, text: "Go gently. Quiet company, a snack, and no pressure to talk."),
            HelpCard(mood: "🔴 Low Battery", text: "Dim lights, tea, and let them be. No questions tonight."),
        ]
        return s
    }
}
