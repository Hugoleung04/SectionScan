import Foundation

#if !targetEnvironment(simulator)
import RealityKit
#endif

enum ReconstructionError: LocalizedError {
    case unsupported
    case noFolder
    case tooFewImages(Int)
    case failed(String)
    case cancelled

    var errorDescription: String? {
        switch self {
        case .unsupported:
            return DeviceCapabilities.unsupportedMessage
        case .noFolder:
            return "尚未有掃描相片資料夾。"
        case .tooFewImages(let count):
            return "相片太少（現有 \(count) 張）。建議至少 \(CaptureFolder.recommendedMinImages) 張、重疊約 60–80%，繞物件一圈再高低各一圈。"
        case .failed(let message):
            return message
        case .cancelled:
            return "已取消重建。"
        }
    }
}

/// Runs `PhotogrammetrySession` on a folder of images (HEIC + depth when present).
enum PhotogrammetryRunner {
    /// On-device iOS only supports `.reduced` (mobile-sized USDZ). `.medium` / `.full` fail on iPhone.
    static func run(
        folder: CaptureFolder,
        progress: @escaping @Sendable (Double, String) -> Void
    ) async throws -> URL {
        #if targetEnvironment(simulator)
        throw ReconstructionError.unsupported
        #else
        guard PhotogrammetrySession.isSupported else {
            throw ReconstructionError.unsupported
        }

        let count = folder.imageCount()
        guard count >= CaptureFolder.hardMinImages else {
            throw ReconstructionError.tooFewImages(count)
        }

        let outputURL = folder.modelOutputURL()
        try? FileManager.default.removeItem(at: outputURL)

        var configuration = PhotogrammetrySession.Configuration()
        configuration.checkpointDirectory = folder.snapshots

        let session = try PhotogrammetrySession(
            input: folder.images,
            configuration: configuration
        )

        // Explicit `.reduced` — the only detail level Apple documents as supported on iOS.
        let request = PhotogrammetrySession.Request.modelFile(
            url: outputURL,
            detail: .reduced,
            geometry: nil
        )
        try session.process(requests: [request])

        var producedURL: URL?
        var requestError: Error?

        sessionLoop: for try await output in session.outputs {
            switch output {
            case .inputComplete:
                progress(0.02, "已讀入 \(count) 張相片，開始重建…")
            case .requestProgress(_, let fractionComplete):
                let pct = max(0, min(1, fractionComplete))
                progress(pct, String(format: "重建進度 %.0f%%", pct * 100))
            case .requestComplete(_, let result):
                if case .modelFile(let url) = result {
                    producedURL = url
                }
            case .requestError(_, let error):
                requestError = error
                break sessionLoop
            case .processingComplete:
                break sessionLoop
            case .processingCancelled:
                throw ReconstructionError.cancelled
            case .invalidSample(let id, let reason):
                progress(-1, "略過無效相片 #\(id)：\(String(describing: reason))")
            case .skippedSample(let id):
                progress(-1, "略過相片 #\(id)")
            case .automaticDownsampling:
                progress(-1, "記憶體不足，已自動降低解像度繼續重建。")
            @unknown default:
                break
            }
        }

        if let requestError {
            throw ReconstructionError.failed(requestError.localizedDescription)
        }
        guard let producedURL else {
            throw ReconstructionError.failed("重建完成但找不到 USDZ 檔。")
        }

        let shareURL = folder.shareableModelURL()
        try? FileManager.default.removeItem(at: shareURL)
        try FileManager.default.copyItem(at: producedURL, to: shareURL)
        return shareURL
        #endif
    }
}
