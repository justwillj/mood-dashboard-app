import SwiftUI
import MoodCore

/// Single source of truth for the detail chips shown on hero cards and history rows.
extension CheckIn {
    var detailChips: [String] {
        [need?.fullLabel,
         capacity.social.map { "Social: \($0)/5" },
         capacity.sensory.map { "Sensory: \($0)/5" },
         capacity.talk?.label,
         noReply ? "🤫 No reply needed" : nil]
            .compactMap { $0 }
    }
}

struct HeroCard: View {
    let heading: String
    let checkIn: CheckIn?
    let presets: [MoodPreset]
    let theme: Theme
    let accent: HexColor, fill: HexColor, stroke: HexColor
    var stale = false
    var alert: LowEnergyAlert?
    /// Non-nil makes the card editable (tap anywhere, or the pencil).
    var onEdit: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(heading.uppercased())
                    .font(.caption.weight(.semibold)).tracking(1.2)
                    .foregroundStyle(Color(accent))
                Spacer()
                if let onEdit {
                    Button(action: onEdit) {
                        Image(systemName: "pencil")
                            .font(.footnote.weight(.semibold))
                            .padding(8)
                            .foregroundStyle(Color(theme.textDim))
                            .background(Color(theme.cardSec), in: Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Edit check-in")
                }
            }

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
        .contentShape(RoundedRectangle(cornerRadius: 22))
        .onTapGesture { onEdit?() }
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

        let chips = c.detailChips
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