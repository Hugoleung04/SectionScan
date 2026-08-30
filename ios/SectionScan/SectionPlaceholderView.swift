import SwiftUI

struct SectionPlaceholderView: View {
    @EnvironmentObject var session: ScanSession

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("橫截面")
                .font(.headline)
            Text("第一版可執行的截面引擎在網頁 App。用 Safari 打開電腦提供的網址，或把匯出的 USDZ/GLB 匯入網頁版，即可移動切面、看 2D 輪廓、量毫米、匯出 SVG。")
                .foregroundStyle(.secondary)

            LabeledContent("目前相片", value: "\(session.images.count) 張")
            LabeledContent("預設定標高度", value: String(format: "%.0f mm", session.heightMM))

            Text("下一步在 RealityKit 對 mesh 做平面求交，把交線投影成 2D。演算法已寫在 ../js/section.js，可直接移植。")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding()
    }
}
