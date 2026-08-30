import SwiftUI
import RealityKit

struct ReconstructionView: View {
    @EnvironmentObject var session: ScanSession
    @State private var message = "Object Capture 需真機與 Xcode 權限。"

    var body: some View {
        VStack(spacing: 16) {
            Text("3D 重建")
                .font(.headline)
            Text(message)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)

            if #available(iOS 17.0, *) {
                Text("在 Xcode 建立 App 後，把 Guided Capture 接到這裡。建議流程：ObjectCaptureSession 拍攝 → PhotogrammetrySession 重建 USDZ → 在截面頁切開。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Button("開始 Object Capture（真機）") {
                message = "請用 Xcode 在真機執行，並加入 NSCameraUsageDescription、NSWorldSensingUsageDescription。"
            }
            .buttonStyle(.borderedProminent)

            Text("現階段可先把 Polycam / Scaniverse 的 USDZ 或 GLB 拷進 App，用網頁版截面工具驗證量度流程。")
                .font(.footnote)
                .foregroundStyle(.secondary)

            Spacer()
        }
        .padding()
    }
}

#if os(iOS)
@available(iOS 17.0, *)
enum ObjectCaptureNotes {
    /// 實作時使用：
    /// 1. ObjectCaptureSession + ObjectCaptureView 引導拍攝
    /// 2. 將 HEIC（含深度）交給 PhotogrammetrySession
    /// 3. 輸出 USDZ，保留真實比例
    /// 4. RealityKit 載入後做 plane-mesh intersection
    static let recommendedMinImages = 20
    static let maxObjectDiameterMeters = 2.0
}
#endif
