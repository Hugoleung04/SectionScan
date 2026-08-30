import SwiftUI
import RealityKit

struct ReconstructionView: View {
    @EnvironmentObject var session: ScanSession
    @State private var showShare = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                Text("3D 模型")
                    .font(.headline)

                if session.isReconstructing {
                    ProgressView(value: session.reconstructionProgress, total: 1)
                    Text(session.reconstructionMessage.isEmpty ? "重建中…" : session.reconstructionMessage)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                    Text("請保持 App 在前景。重建很吃記憶體，大型物件可能需要數分鐘。")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                } else if let url = session.modelURL {
                    ModelPreview(url: url)
                        .frame(minHeight: 320)

                    Text(url.lastPathComponent)
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    Button {
                        showShare = true
                    } label: {
                        Label("分享／匯出 USDZ", systemImage: "square.and.arrow.up")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)

                    ShareLink(item: url, preview: SharePreview("剖形 3D 模型", image: Image(systemName: "cube"))) {
                        Label("AirDrop、檔案、其他 App", systemImage: "airdrop")
                    }
                    .buttonStyle(.bordered)
                } else {
                    Image(systemName: "cube.transparent")
                        .font(.system(size: 48))
                        .foregroundStyle(.mint)
                    Text(emptyMessage)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                if let error = session.lastError, !session.isReconstructing, !error.isEmpty {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .multilineTextAlignment(.center)
                }

                if !session.isReconstructing {
                    Button {
                        Task { await session.reconstruct() }
                    } label: {
                        Label("開始 Object Capture 重建", systemImage: "gearshape.2")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.mint)
                    .disabled(!session.canReconstruct || !DeviceCapabilities.isReconstructionSupported)
                }

                Text("成功後會寫入 USDZ（裝置端細節等級為 `.reduced`，這是 iOS 唯一支援的等級）。可用分享表 AirDrop 到 Mac，或匯入網頁版截面工具。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
        .sheet(isPresented: $showShare) {
            if let url = session.modelURL {
                ActivityShareSheet(items: [url])
            }
        }
        .onAppear { session.refreshFromDisk() }
    }

    private var emptyMessage: String {
        if !DeviceCapabilities.isReconstructionSupported {
            return DeviceCapabilities.unsupportedMessage
        }
        if session.imageCount == 0 {
            return "尚未有模型。請到「掂描」用引導拍攝，或從相簿揀選一批相片後重建。"
        }
        return "已有 \(session.imageCount) 張相片，按下方按鈕開始 PhotogrammetrySession 重建。"
    }
}

struct ModelPreview: View {
    let url: URL

    var body: some View {
        Model3D(url: url) { model in
            model
                .resizable()
                .aspectRatio(contentMode: .fit)
        } placeholder: {
            ProgressView("載入 USDZ…")
                .frame(maxWidth: .infinity, minHeight: 280)
        }
        .frame(maxWidth: .infinity, minHeight: 280)
    }
}

struct ActivityShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
