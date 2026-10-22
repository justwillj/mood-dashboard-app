import SwiftUI
import MoodCore

struct DashboardView: View {
    @Environment(DashboardViewModel.self) private var vm
    @State private var showLog = false

    var body: some View {
        let t = vm.theme
        
        ScrollView {
            VStack(spacing: 16) {
                // Top Friend Bar & Theme Switcher
                FriendBar()
                
                // User's Hero Card
                HeroCard(title: "You", status: vm.mine)
                
                // Friend Hero Card
                if let friend = vm.selectedFriend {
                    HeroCard(title: friend.name, status: vm.partnerStatus)
                }
            }
            .padding(16)
        }
        .background(Color(t.bg).ignoresSafeArea())
        .preferredColorScheme(.dark)
        .animation(.snappy, value: vm.theme.id)
        
        // Bottom Log Mood Action Bar
        .safeAreaInset(edge: .bottom) {
            HStack(spacing: 10) {
                Button { 
                    showLog = true 
                } label: {
                    Label("Log mood", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(Color(t.btnPrimary), in: Capsule())
                        .foregroundStyle(Color(t.text))
                }
                
                if vm.mine != nil {
                    Button { 
                        Task { await vm.logSameAsLast() } 
                    } label: {
                        Image(systemName: "arrow.counterclockwise")
                            .padding(13)
                            .background(Color(t.card), in: Circle())
                            .foregroundStyle(Color(t.textDim))
                    }
                    .accessibilityLabel("Same as last")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial)
        }
        .sheet(isPresented: $showLog) {
            LogMoodSheet()
        }
    }
}