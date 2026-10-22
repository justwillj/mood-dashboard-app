import SwiftUI
import MoodCore

struct FriendBar: View {
    @Environment(DashboardViewModel.self) private var vm

    var body: some View {
        let t = vm.theme
        HStack(spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(vm.friends) { f in
                        let on = f.id == vm.selectedFriend?.id
                        Button { vm.select(f) } label: {
                            Text(f.name)
                                .font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 14).padding(.vertical, 8)
                                .foregroundStyle(Color(on ? t.text : t.textDim))
                                .background(Color(on ? t.btnPrimary : t.card), in: Capsule())
                                .overlay(Capsule().stroke(Color(on ? t.btnPrimaryBorder : t.border)))
                        }
                    }
                }
            }
            Button { vm.cycleTheme() } label: {
                Image(systemName: "paintpalette")
                    .padding(9)
                    .foregroundStyle(Color(t.textDim))
                    .background(Color(t.card), in: Circle())
            }
            .accessibilityLabel("Change theme")
        }
    }
}