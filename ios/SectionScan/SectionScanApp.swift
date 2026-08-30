import SwiftUI

@main
struct SectionScanApp: App {
    @StateObject private var session = ScanSession()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .preferredColorScheme(.dark)
        }
    }
}
