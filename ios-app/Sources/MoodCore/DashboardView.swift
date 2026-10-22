import SwiftUI
import MoodCore

struct DashboardView: View {
    @Environment(DashboardViewModel.self) private var vm

    var body: some View {
        let t = vm.theme
        ScrollView {
            VStack(spacing: 16) {
                FriendBar()

                if let msg = vm.errorMessage {
                    Text(msg).font(.footnote).foregroundStyle(Color(t.accentPartner))
                }

                HeroCard(heading: "You",
                         checkIn: vm.mine, presets: vm.presets, theme: t,
                         accent: t.accentMe, fill: t.heroMe, stroke: t.border,
                         alert: vm.myAlert)

                HeroCard(heading: vm.selectedFriend?.name ?? "Friend",
                         checkIn: vm.theirs, presets: vm.presets, theme: t,
                         accent: t.accentPartner, fill: t.heroPartner, stroke: t.borderPartner,
                         stale: vm.theirsStale, alert: vm.theirAlert)
            }
            .padding(16)
        }
        .background(Color(t.bg).ignoresSafeArea())
        .preferredColorScheme(.dark)   // all three themes are dark
        .animation(.snappy, value: vm.theme.id)
    }
}