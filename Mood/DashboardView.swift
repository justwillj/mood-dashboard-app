import SwiftUI
import MoodCore

struct DashboardView: View {
    @Environment(DashboardViewModel.self) private var vm
    @State private var route: SheetRoute?

    private enum SheetRoute: Identifiable {
        case log
        case edit(CheckIn)

        var id: String {
            switch self {
            case .log: "log"
            case .edit(let c): "edit-\(c.id)"
            }
        }
    }

    var body: some View {
        let t = vm.theme
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    FriendBar()

                    if let msg = vm.errorMessage {
                        Text(msg).font(.footnote).foregroundStyle(Color(t.accentPartner))
                    }

                    HeroCard(heading: "You",
                             checkIn: vm.mine, presets: vm.presets, theme: t,
                             accent: t.accentMe, fill: t.heroMe, stroke: t.border,
                             alert: vm.myAlert,
                             onEdit: vm.mine.map { c in { route = .edit(c) } })

                    HeroCard(heading: vm.selectedFriend?.name ?? "Friend",
                             checkIn: vm.theirs, presets: vm.presets, theme: t,
                             accent: t.accentPartner, fill: t.heroPartner, stroke: t.borderPartner,
                             stale: vm.theirsStale, alert: vm.theirAlert)

                    historyLink(t)
                }
                .padding(16)
            }
            .background(Color(t.bg).ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 10) {
                    Button { route = .log } label: {
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
            .sheet(item: $route) { r in
                switch r {
                case .log: LogMoodSheet()
                case .edit(let c): LogMoodSheet(editing: c)
                }
            }
        }
        .tint(Color(t.accentMe))
        .preferredColorScheme(.dark)
        .animation(.snappy, value: vm.theme.id)
    }

    private func historyLink(_ t: Theme) -> some View {
        NavigationLink {
            HistoryView()
        } label: {
            HStack {
                Label("History", systemImage: "clock.arrow.circlepath")
                Spacer()
                Text("\(vm.history.count)")
                    .font(.footnote).foregroundStyle(Color(t.textSub))
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold)).foregroundStyle(Color(t.textSub))
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Color(t.textDim))
            .padding(14)
            .background(Color(t.card), in: RoundedRectangle(cornerRadius: 16))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color(t.border)))
        }
        .buttonStyle(.plain)
        .disabled(vm.history.isEmpty)
    }
}