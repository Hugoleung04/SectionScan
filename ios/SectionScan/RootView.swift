import SwiftUI

enum AppTab: String, CaseIterable {
    case capture = "掂描"
    case model = "模型"
    case section = "截面"
}

struct RootView: View {
    @EnvironmentObject var session: ScanSession
    @State private var tab: AppTab = .capture

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("剖形").font(.title2.bold())
                    Text("掂描外形 · 看橫截面 · 量毫米")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(session.headerBadge)
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

            Group {
                switch tab {
                case .capture:
                    CaptureView()
                case .model:
                    ReconstructionView()
                case .section:
                    SectionPlaceholderView()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(Color.black.opacity(0.92))
        .onChange(of: session.wantsModelTab) { _, wants in
            if wants {
                tab = .model
                session.wantsModelTab = false
            }
        }
    }
}
