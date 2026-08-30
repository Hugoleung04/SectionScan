import Foundation

#if !targetEnvironment(simulator)
import RealityKit
#endif

/// Runtime checks for Apple Object Capture. Types themselves are unavailable
/// in the iOS Simulator SDK, so every RealityKit capture/reconstruction API
/// is compiled out there.
enum DeviceCapabilities {
    static var isSimulator: Bool {
        #if targetEnvironment(simulator)
        true
        #else
        false
        #endif
    }

    /// Guided capture (`ObjectCaptureSession` + `ObjectCaptureView`) needs a
    /// LiDAR device on iOS 17+. Check this *before* creating a session.
    static var isGuidedCaptureSupported: Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        return ObjectCaptureSession.isSupported
        #endif
    }

    /// On-device photogrammetry (`PhotogrammetrySession`). Independent of
    /// guided capture: library photos can still reconstruct on some devices
    /// that cannot run the LiDAR capture UI.
    static var isReconstructionSupported: Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        return PhotogrammetrySession.isSupported
        #endif
    }

    static var unsupportedMessage: String {
        if isSimulator {
            return "模擬器不支援 Apple Object Capture。請用 Xcode 在真機（iOS 17 或以上）執行。建議 iPhone 12 Pro 或更新的 Pro 機型（有 LiDAR）以取得真實尺寸。"
        }
        if !isGuidedCaptureSupported && !isReconstructionSupported {
            return "此裝置不支援 Apple Object Capture 裝置端重建。需要 iOS 17 或以上，並建議 iPhone 12 Pro 或更新的 Pro 機型（有 LiDAR）。你可以改用網頁版匯入 GLB。"
        }
        if !isGuidedCaptureSupported {
            return "此裝置不支援引導拍攝（需要 LiDAR）。你仍然可以從相簿揀選已有相片，嘗試裝置端重建。"
        }
        return ""
    }
}
