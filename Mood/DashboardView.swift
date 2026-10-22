import SwiftUI
import MoodCore

struct DashboardView: View {
    @Environment(DashboardViewModel.self) private var vm
    @State private var showLog = false

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
        .preferredColorScheme(.dark)
        .animation(.snappy, value: vm.theme.id)
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 10) {
                Button { showLog = true } label: {
                    Label("Log mood", systemImage: "plus")
                        .frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(Color(t.btnPrimary), in: Capsule())
                        .foregroundStyle(Color(t.text))
                }
                if vm.mine != nil {
                    Button { Task { await vm.logSameAsLast() } } label: {
                        Image(systemName: "arrow.counterclockwise")
                            .padding(13)
                            .background(Color(t.card), in: Circle())
                            .foregroundStyle(Color(t.textDim))
                    }
                    .accessibilityLabel("Same as last")
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(.ultraThinMaterial)
        }
        .sheet(isPresented: $showLog) { LogMoodSheet() }
    }
}