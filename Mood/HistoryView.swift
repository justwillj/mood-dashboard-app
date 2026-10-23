import SwiftUI
import MoodCore

struct HistoryView: View {
    @Environment(DashboardViewModel.self) private var vm

    @State private var filter: Filter = .all
    @State private var editing: CheckIn?
    @State private var pendingDelete: CheckIn?

    private enum Filter: Hashable { case all, mine, theirs }

    private struct DayGroup: Identifiable {
        let day: Date
        let items: [CheckIn]
        var id: Date { day }
    }

    // MARK: Derived

    /// History is the circle with the selected friend, so every entry is
    /// either mine or theirs.
    private func isMine(_ c: CheckIn) -> Bool { c.authorID != vm.selectedFriend?.id }

    private var friendName: String { vm.selectedFriend?.name ?? "Friend" }

    private var groups: [DayGroup] {
        let cal = Calendar.current
        let items = vm.history.filter {
            switch filter {
            case .all: true
            case .mine: isMine($0)
            case .theirs: !isMine($0)
            }
        }
        return Dictionary(grouping: items) { cal.startOfDay(for: $0.createdAt) }
            .map { DayGroup(day: $0.key, items: $0.value.sorted { $0.createdAt > $1.createdAt }) }
            .sorted { $0.day > $1.day }
    }

    // MARK: Body

    var body: some View {
        let t = vm.theme
        List {
            if groups.isEmpty {
                Text("Nothing here yet")
                    .foregroundStyle(Color(t.textDim))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 40)
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
            }

            ForEach(groups) { g in
                Section {
                    ForEach(g.items) { c in
                        row(c, t)
                            .listRowBackground(Color(t.card))
                            .listRowSeparatorTint(Color(t.border))
                            .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                                if isMine(c) {
                                    Button(role: .destructive) { pendingDelete = c } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                if isMine(c) {
                                    Button { editing = c } label: {
                                        Label("Edit", systemImage: "pencil")
                                    }
                                    .tint(Color(t.btnPrimary))
                                }
                            }
                    }
                } header: {
                    Text(dayTitle(g.day).uppercased())
                        .font(.caption.weight(.semibold)).tracking(1.2)
                        .foregroundStyle(Color(t.textSub))
                }
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color(t.bg).ignoresSafeArea())
        .navigationTitle("History")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.visible, for: .navigationBar)
        .toolbarBackground(Color(t.bg), for: .navigationBar)
        .toolbarBackground(.visible, for: .navigationBar)
        .safeAreaInset(edge: .top, spacing: 0) { header(t) }
        .preferredColorScheme(.dark)
        .sheet(item: $editing) { LogMoodSheet(editing: $0) }
        .confirmationDialog(
            "Delete this check-in?",
            isPresented: Binding(
                get: { pendingDelete != nil },
                set: { if !$0 { pendingDelete = nil } }),
            titleVisibility: .visible,
            presenting: pendingDelete
        ) { c in
            Button("Delete", role: .destructive) { Task { await vm.delete(c.id) } }
            Button("Keep it", role: .cancel) {}
        } message: { _ in
            Text("It will be removed for everyone it was shared with. This can't be undone.")
        }
    }

    // MARK: Pieces

    private func header(_ t: Theme) -> some View {
        VStack(spacing: 8) {
            Picker("Show", selection: $filter) {
                Text("All").tag(Filter.all)
                Text("You").tag(Filter.mine)
                Text(friendName).tag(Filter.theirs)
            }
            .pickerStyle(.segmented)

            if let msg = vm.errorMessage {
                Text(msg).font(.footnote).foregroundStyle(Color(t.accentPartner))
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(Color(t.bg))
    }

    private func row(_ c: CheckIn, _ t: Theme) -> some View {
        let mine = isMine(c)
        return Button {
            if mine { editing = c }
        } label: {
            VStack(alignment: .leading, spacing: 6) {
                HStack(alignment: .firstTextBaseline) {
                    Text(c.isResting ? "🌙 Resting" : c.mood)
                        .font(.headline).foregroundStyle(Color(t.text))
                    Spacer()
                    Text(mine ? "You" : friendName)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .foregroundStyle(Color(mine ? t.accentMe : t.accentPartner))
                        .background(Color(mine ? t.accentMe : t.accentPartner).opacity(0.15), in: Capsule())
                }

                if !c.isResting {
                    Text(Energy.dots(c.energy(presets: vm.presets)))
                        .font(.caption).tracking(3).foregroundStyle(Color(t.dots))
                }

                if !c.note.isEmpty {
                    Text(c.note).font(.subheadline).foregroundStyle(Color(t.note))
                }

                let chips = [c.need?.fullLabel, c.capacity.talk?.label, c.noReply ? "🤫 No reply needed" : nil]
                    .compactMap { $0 }
                if !chips.isEmpty {
                    Text(chips.joined(separator: "  ·  "))
                        .font(.caption).foregroundStyle(Color(t.textDim))
                }

                Text(timeLine(c))
                    .font(.caption).foregroundStyle(Color(t.textSub))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(mine ? "Double tap to edit" : "")
    }

    private func timeLine(_ c: CheckIn) -> String {
        var s = c.createdAt.formatted(date: .omitted, time: .shortened)
        if c.isEdited { s += " · edited" }
        return s
    }

    private func dayTitle(_ d: Date) -> String {
        let cal = Calendar.current
        if cal.isDateInToday(d) { return "Today" }
        if cal.isDateInYesterday(d) { return "Yesterday" }
        return d.formatted(.dateTime.weekday(.wide).month(.abbreviated).day())
    }
}