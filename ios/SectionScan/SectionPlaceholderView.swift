import SwiftUI

struct SectionPlaceholderView: View {
    @EnvironmentObject var session: ScanSession

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("橫截面")
                .font(.headline)
            Text("截面引擎目前在網頁 App。把本 App 匯出的 USDZ 用分享表傳到 Mac／檔案，再匯入網頁版，即可移動切面、看 2D 輪廓、量毫米、匯出 SVG。")
                .foregroundStyle(.secondary)

            LabeledContent("目前相片", value: "\(session.imageCount) 張")
            LabeledContent("3D 模型", value: session.modelURL == nil ? "尚未重建" : "已有 USDZ")
            LabeledContent("預設定標高度", value: String(format: "%.0f mm", session.heightMM))

            if let pages = URL(string: "https://hugoleung04.github.io/SectionScan/") {
                Link("在 Safari 打開網頁版截面工具", destination: pages)
            }

            Text("原生 RealityKit 平面求交會留待下一版。演算法已在網頁版 js/section.js。")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding()
    }
}
