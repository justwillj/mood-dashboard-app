import SwiftUI
import MoodCore

@main
struct MoodApp: App {
    @State private var vm: DashboardViewModel
    private let settings: SettingsStore
    @Environment(\.scenePhase) private var phase

    init() {
        let settings = SettingsStore()
        self.settings = settings
        _vm = State(initialValue: DashboardViewModel(store: Self.makeStore(), settings: settings))
    }

    var body: some Scene {
        WindowGroup {
            DashboardView()
                .environment(vm)
                .task { vm.start() }
        }
        .onChange(of: phase) { _, new in
            if new == .active { settings.reloadFromDisk() }   // widget intents may have changed prefs
        }
    }

    private static func makeStore() -> JSONMoodStore {
        let dir = JSONMoodStore.appGroupDirectory(SettingsKeys.suite) ?? URL.documentsDirectory
        #if DEBUG
        let seed: JSONMoodStore.Snapshot? = .demo(me: "dylan", partner: Friend(id: "will", name: "Will"))
        #else
        let seed: JSONMoodStore.Snapshot? = nil
        #endif
        do { return try JSONMoodStore(me: "dylan", directory: dir, seed: seed) }
        catch { fatalError("Store failed to open: \(error)") }   // TODO: real onboarding/error UI
    }
}