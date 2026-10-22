import SwiftUI
import MoodCore

struct HeroCard: View {
    let heading: String
    let checkIn: CheckIn?
    let presets: [MoodPreset]
    let theme: Theme
    let accent: HexColor, fill: HexColor, stroke: HexColor
    var stale = false
    var alert: LowEnergyAlert?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(heading.uppercased())
                .font(.caption.weight(.semibold)).tracking(1.2)
                .foregroundStyle(Color(accent))

            if let c = checkIn { content(c) }
            else { Text("No check-in yet").foregroundStyle(Color(theme.textDim)) }

            if let a = alert {
                Label("Low lately · \(a.low) of the last \(a.days) days", systemImage: "battery.25")
                    .font(.footnote).foregroundStyle(Color(theme.accentPartner))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(Color(fill), in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(Color(stroke)))
        .opacity(stale ? 0.7 : 1)
    }

    @ViewBuilder private func content(_ c: CheckIn) -> some View {
        Text(c.isResting ? "🌙 Resting" : c.mood)
            .font(.title2.weight(.bold)).foregroundStyle(Color(theme.text))

        if !c.isResting {
            Text(Energy.dots(c.energy(presets: presets)))
                .font(.callout).tracking(3).foregroundStyle(Color(theme.dots))
        }
        if !c.note.isEmpty {
            Text(c.note).font(.body).foregroundStyle(Color(theme.note))
        }

        let chips = [c.need?.fullLabel, c.capacity.talk?.label, c.noReply ? "🤫 No reply needed" : nil]
            .compactMap { $0 }
        if !chips.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack { ForEach(chips, id: \.self) { chip($0) } }
            }
        }

        HStack(spacing: 4) {
            Text(c.createdAt, style: .relative) + Text(" ago")
            if c.isEdited { Text("· edited") }
            if stale { Text("· may be out of date") }
        }
        .font(.caption).foregroundStyle(Color(theme.textSub))
    }

    private func chip(_ s: String) -> some View {
        Text(s).font(.caption)
            .padding(.horizontal, 10).padding(.vertical, 5)
            .foregroundStyle(Color(theme.textDim))
            .background(Color(theme.cardSec), in: Capsule())
    }
}