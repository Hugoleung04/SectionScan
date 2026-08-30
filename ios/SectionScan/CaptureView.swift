import SwiftUI
import PhotosUI

struct CaptureView: View {
    @EnvironmentObject var session: ScanSession
    @State private var showGuidedCapture = false
    @State private var pickedItems: [PhotosPickerItem] = []

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("繞物件拍攝，直徑建議不超過 2 米。重疊約 60–80%。建議 20 張或以上。")
                    .foregroundStyle(.secondary)

                capabilityBanner

                Text(session.status)
                    .font(.body.weight(.medium))

                if let error = session.lastError, !error.isEmpty {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }

                thumbnailStrip

                if DeviceCapabilities.isGuidedCaptureSupported {
                    Button {
                        showGuidedCapture = true
                    } label: {
                        Label("開始引導拍攝（Object Capture）", systemImage: "camera.viewfinder")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(session.isReconstructing)
                } else {
                    Text(DeviceCapabilities.unsupportedMessage)
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }

                PhotosPicker(
                    selection: $pickedItems,
                    maxSelectionCount: 200,
                    matching: .images,
                    photoLibrary: .shared()
                ) {
                    Label("從相簿揀選已有相片", systemImage: "photo.on.rectangle.angled")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(session.isReconstructing)

                Button {
                    Task { await session.reconstruct() }
                } label: {
                    Label(
                        session.imageCount < CaptureFolder.recommendedMinImages
                            ? "開始重建（現有 \(session.imageCount) 張，建議 \(CaptureFolder.recommendedMinImages)+）"
                            : "用這批相片重建 3D",
                        systemImage: "cube.transparent"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.mint)
                .disabled(session.isReconstructing || !session.canReconstruct || !DeviceCapabilities.isReconstructionSupported)

                Button("開始新掃描（清空目前批次）") {
                    session.startNewScan()
                    pickedItems = []
                }
                .disabled(session.isReconstructing)

                Text("引導拍攝會把 HEIC（含深度，如裝置有 LiDAR）寫入 App 的 Images 資料夾，再交 `PhotogrammetrySession` 輸出 USDZ。相簿相片會複製到同一個資料夾再重建。Object Capture 無法在模擬器執行，也無法假裝成功。")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding()
        }
        .onAppear { session.refreshFromDisk() }
        .onChange(of: pickedItems) { _, items in
            guard !items.isEmpty else { return }
            Task {
                await session.importPickerItems(items)
                pickedItems = []
            }
        }
        .fullScreenCover(isPresented: $showGuidedCapture) {
            GuidedCaptureView()
                .environmentObject(session)
        }
    }

    @ViewBuilder
    private var capabilityBanner: some View {
        VStack(alignment: .leading, spacing: 4) {
            labeled("引導拍攝", DeviceCapabilities.isGuidedCaptureSupported ? "可用（真機 LiDAR）" : "不可用")
            labeled("裝置端重建", DeviceCapabilities.isReconstructionSupported ? "可用" : "不可用")
            labeled("目前相片", "\(session.imageCount) 張")
        }
        .font(.footnote)
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        HStack {
            Text(title).foregroundStyle(.secondary)
            Spacer()
            Text(value)
        }
    }

    @ViewBuilder
    private var thumbnailStrip: some View {
        if session.thumbnails.isEmpty {
            Text("尚未有相片")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack {
                    ForEach(Array(session.thumbnails.enumerated()), id: \.offset) { _, image in
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 76, height: 76)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        }
    }
}
