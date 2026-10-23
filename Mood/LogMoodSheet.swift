import SwiftUI
import MoodCore

struct LogMoodSheet: View {
    @Environment(DashboardViewModel.self) private var vm
    @Environment(\.dismiss) private var dismiss

    private static let restingID = "resting"

    /// nil = new check-in; non-nil = editing this one.
    private let editing: CheckIn?

    @State private var pick: String?            // preset.id or restingID
    @State private var note: String
    @State private var noReply: Bool
    @State private var need: Need?
    @State private var social: Int?
    @State private var sensory: Int?
    @State private var talk: TalkPreference?
    @State private var shareWith: Set<UserID>
    @State private var saving = false
    @State private var confirmDelete = false

    init(editing: CheckIn? = nil) {
        self.editing = editing
        _pick = State(initialValue: editing.map { $0.isResting ? Self.restingID : $0.mood })
        _note = State(initialValue: editing?.note ?? "")
        _noReply = State(initialValue: editing?.noReply ?? false)
        _need = State(initialValue: editing?.need)
        _social = State(initialValue: editing?.capacity.social)
        _sensory = State(initialValue: editing?.capacity.sensory)
        _talk = State(initialValue: editing?.capacity.talk)
        _shareWith = State(initialValue: editing?.sharedWith ?? [])
    }

    private var isEditing: Bool { editing != nil }
    private var resting: Bool { pick == Self.restingID }
    private var multiFriend: Bool { vm.friends.count > 1 }
    private var canSave: Bool {
        pick != nil && !saving && (!multiFriend || !shareWith.isEmpty)
    }

    var body: some View {
        let t = vm.theme
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    if let msg = vm.errorMessage {
                        Text(msg).font(.footnote).foregroundStyle(Color(t.accentPartner))
                    }

                    section("How are you?", t) { moodGrid(t) }

                    section("Note", t) { noteField(t) }

                    section("What I need right now", t) {
                        chipRow(Need.allCases, selection: $need, label: \.fullLabel, t)
                    }

                    if !resting {
                        section("Capacity", t) {
                            ScaleRow(title: "Social", value: $social, theme: t)
                            ScaleRow(title: "Sensory", value: $sensory, theme: t)
                            chipRow(TalkPreference.allCases, selection: $talk, label: \.label, t)
                        }
                    }

                    if multiFriend {
                        section("Share with", t) { shareRow(t) }
                    }

                    if isEditing {
                        deleteButton(t)
                    }
                }
                .padding(16)
            }
            .background(Color(t.bg).ignoresSafeArea())
            .navigationTitle(isEditing ? "Edit check-in" : "Log mood")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(!canSave)
                }
            }
            .confirmationDialog("Delete this check-in?",
                                isPresented: $confirmDelete,
                                titleVisibility: .visible) {
                Button("Delete", role: .destructive) { Task { await delete() } }
                Button("Keep it", role: .cancel) {}
            } message: {
                Text("It will be removed for everyone it was shared with. This can't be undone.")
            }
        }
        .preferredColorScheme(.dark)
        .onAppear { seedShareTargets() }
    }

    // MARK: Sections

    private func moodGrid(_ t: Theme) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(vm.presets) { p in
                tile(id: p.id, title: p.title, dots: Energy.dots(p.energy), t)
            }
            // Editing an entry whose preset has since been renamed/removed:
            // keep its mood selectable so saving doesn't silently change it.
            if let m = editing?.mood, !m.isEmpty,
               !vm.presets.contains(where: { $0.id == m }) {
                tile(id: m, title: m, dots: nil, t)
            }
            tile(id: Self.restingID, title: "🌙 Resting", dots: nil, t)
        }
    }

    private func tile(id: String, title: String, dots: String?, _ t: Theme) -> some View {
        let on = pick == id
        return Button { pick = id } label: {
            VStack(alignment: .leading, spacing: 4) {
                Text(title).font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color(t.text))
                if let dots {
                    Text(dots).font(.caption).tracking(2).foregroundStyle(Color(t.dots))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color(on ? t.btnPrimary : t.card), in: RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14)
                .stroke(Color(on ? t.btnPrimaryBorder : t.border)))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func noteField(_ t: Theme) -> some View {
        VStack(alignment: .trailing, spacing: 6) {
            TextField("Optional note", text: $note, axis: .vertical)
                .lineLimit(1...3)
                .padding(12)
                .foregroundStyle(Color(t.text))
                .background(Color(t.card), in: RoundedRectangle(cornerRadius: 14))
                .onChange(of: note) { _, new in
                    if new.count > CheckIn.maxNoteLength {
                        note = String(new.prefix(CheckIn.maxNoteLength))
                    }
                }
            Text("\(note.count)/\(CheckIn.maxNoteLength)")
                .font(.caption2).foregroundStyle(Color(t.textSub))
            Toggle("🤫 No reply needed", isOn: $noReply)
                .font(.subheadline).foregroundStyle(Color(t.textDim))
                .tint(Color(t.btnPrimary))
        }
    }

    /// Single-select chips; tapping the selected chip clears it.
    private func chipRow<T: Hashable>(_ items: [T], selection: Binding<T?>,
                                      label: KeyPath<T, String>, _ t: Theme) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.self) { item in
                    let on = selection.wrappedValue == item
                    Button { selection.wrappedValue = on ? nil : item } label: {
                        Text(item[keyPath: label]).font(.footnote)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .foregroundStyle(Color(on ? t.text : t.textDim))
                            .background(Color(on ? t.btnPrimary : t.cardSec), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func shareRow(_ t: Theme) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(vm.friends) { f in
                    let on = shareWith.contains(f.id)
                    Button {
                        if on { shareWith.remove(f.id) } else { shareWith.insert(f.id) }
                    } label: {
                        Label(f.name, systemImage: on ? "checkmark.circle.fill" : "circle")
                            .font(.footnote)
                            .padding(.horizontal, 12).padding(.vertical, 7)
                            .foregroundStyle(Color(on ? t.text : t.textDim))
                            .background(Color(on ? t.btnPrimary : t.cardSec), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func deleteButton(_ t: Theme) -> some View {
        Button(role: .destructive) { confirmDelete = true } label: {
            Label("Delete check-in", systemImage: "trash")
                .frame(maxWidth: .infinity).padding(.vertical, 12)
                .foregroundStyle(Color(t.accentPartner))
                .background(Color(t.card), in: Capsule())
                .overlay(Capsule().stroke(Color(t.borderPartner)))
        }
        .buttonStyle(.plain)
        .disabled(saving)
    }

    private func section<C: View>(_ title: String, _ t: Theme,
                                  @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title.uppercased())
                .font(.caption.weight(.semibold)).tracking(1.2)
                .foregroundStyle(Color(t.textSub))
            content()
        }
    }

    // MARK: Actions

    private func seedShareTargets() {
        guard shareWith.isEmpty else { return }
        let auto = vm.friends.filter(\.autoShare).map(\.id)
        shareWith = Set(auto.isEmpty ? vm.selectedFriend.map { [$0.id] } ?? [] : auto)
    }

    private func save() async {
        saving = true
        if let original = editing {
            await vm.saveEdit(edited(from: original))
        } else {
            let preset = resting ? nil : vm.presets.first { $0.id == pick }
            let cap = resting ? Capacity() : Capacity(social: social, sensory: sensory, talk: talk)
            await vm.logMood(preset, note: note, noReply: noReply, need: need,
                             capacity: cap, sharedWith: shareWith)
        }
        saving = false
        if vm.errorMessage == nil { dismiss() }
    }

    private func delete() async {
        guard let id = editing?.id else { return }
        saving = true
        await vm.delete(id)
        saving = false
        if vm.errorMessage == nil { dismiss() }
    }

    /// Applies the form to the original, keeping id/createdAt (the store
    /// preserves createdAt and stamps editedAt).
    private func edited(from o: CheckIn) -> CheckIn {
        var c = o
        c.note = note
        c.noReply = noReply
        c.need = need
        c.sharedWith = shareWith.isEmpty ? o.sharedWith : shareWith

        if resting {
            c.isResting = true
            c.mood = ""
            c.capacity = Capacity()
        } else {
            let mood = pick ?? o.mood
            c.isResting = false
            c.mood = mood
            var cap = Capacity(energy: o.capacity.energy, social: social, sensory: sensory, talk: talk)
            // Mood changed -> take the new preset's energy; unchanged -> keep stored energy.
            if mood != o.mood, let p = vm.presets.first(where: { $0.id == mood }) {
                cap.energy = p.energy
            }
            c.capacity = cap
        }
        return c
    }
}

/// 1...5 dot picker; tapping the current value clears it (capacity is optional).
private struct ScaleRow: View {
    let title: String
    @Binding var value: Int?
    let theme: Theme

    var body: some View {
        HStack {
            Text(title).font(.subheadline).foregroundStyle(Color(theme.textDim))
            Spacer()
            HStack(spacing: 10) {
                ForEach(1...5, id: \.self) { n in
                    let on = (value ?? 0) >= n
                    Button { value = (value == n) ? nil : n } label: {
                        Circle()
                            .fill(Color(on ? theme.dots : theme.cardSec))
                            .frame(width: 26, height: 26)
                            .overlay(Circle().stroke(Color(theme.border)))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(title) \(n)")
                }
            }
        }
    }
}