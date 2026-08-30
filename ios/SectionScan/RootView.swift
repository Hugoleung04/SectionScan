import SwiftUI

enum AppTab: String, CaseIterable {
    case capture = "掃描"
    case model = "模型"
    case section = "截面"
}

struct RootView: View {
    @State private var tab: AppTab = .capture
    @StateObject private var session = ScanSession()

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("剖形").font(.title2.bold())
                    Text("掃描外形 · 看橫截面 · 量毫米")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text("iPhone 第一版")
                    .font(.caption)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.mint.opacity(0.15))
                    .clipShape(Capsule())
            }
            .padding()

            Picker("分頁", selection: $tab) {
                ForEach(AppTab.allCases, id: \.self) { item in
                    Text(item.rawValue).tag(item)
                }
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)

            TabContent(tab: tab)
                .environmentObject(session)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color.black.opacity(0.92))
    }
}

struct TabContent: View {
    let tab: AppTab
    var body: some View {
        switch tab {
        case .capture:
            CaptureView()
        case .model:
            ReconstructionView()
        case .section:
            SectionPlaceholderView()
        }
    }
}
