import SwiftUI
import Combine

#if !targetEnvironment(simulator)
import RealityKit
#endif

struct GuidedCaptureView: View {
    @EnvironmentObject var scanSession: ScanSession
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        #if targetEnvironment(simulator)
        VStack(spacing: 16) {
            Text("無法引導拍攝")
                .font(.headline)
            Text(DeviceCapabilities.unsupportedMessage)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button("關閉") { dismiss() }
                .buttonStyle(.borderedProminent)
        }
        .padding()
        .preferredColorScheme(.dark)
        #else
        DeviceGuidedCaptureView(dismiss: dismiss)
            .environmentObject(scanSession)
        #endif
    }
}

#if !targetEnvironment(simulator)
private struct DeviceGuidedCaptureView: View {
    @EnvironmentObject var scanSession: ScanSession
    let dismiss: DismissAction

    @State private var session: ObjectCaptureSession?
    @State private var shotCount = 0
    @State private var completedPass = false
    @State private var stateLabel = "正在啟動…"
    @State private var errorMessage: String?
    @State private var didFinish = false

    var body: some View {
        ZStack {
            if let session {
                captureLayer(session)
            } else {
                Color.black.ignoresSafeArea()
                ProgressView("正在啟動 Object Capture…")
            }

            VStack {
                topBar
                Spacer()
                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .padding()
                        .background(.black.opacity(0.6))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .padding()
                }
                bottomControls
            }
        }
        .preferredColorScheme(.dark)
        .task { await start() }
        .onReceive(Timer.publish(every: 0.4, on: .main, in: .common).autoconnect()) { _ in
            poll(session)
        }
    }

    @ViewBuilder
    private func captureLayer(_ session: ObjectCaptureSession) -> some View {
        if completedPass {
            ObjectCapturePointCloudView(session: session)
                .ignoresSafeArea()
        } else {
            ObjectCaptureView(session: session)
                .ignoresSafeArea()
        }
    }

    private var topBar: some View {
        HStack {
            Button("取消") { cancelAndClose() }
            Spacer()
            VStack(spacing: 2) {
                Text("引導拍攝")
                    .font(.headline)
                Text("\(stateLabel) · \(shotCount) 張")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Color.clear.frame(width: 44, height: 1)
        }
        .padding()
        .background(.ultraThinMaterial)
    }

    @ViewBuilder
    private var bottomControls: some View {
        VStack(spacing: 12) {
            if let session {
                switch session.state {
                case .initializing:
                    ProgressView("初始化相機…")
                case .ready:
                    Button("繼續（偵測物件範圍）") {
                        let started = session.startDetecting()
                        if !started {
                            errorMessage = "無法開始偵測。請對準物件、光線充足，然後再試。"
                        }
                    }
                    .buttonStyle(.borderedProminent)
                case .detecting:
                    HStack {
                        Button("重設範圍") { session.resetDetection() }
                            .buttonStyle(.bordered)
                        Button("開始拍攝") { session.startCapturing() }
                            .buttonStyle(.borderedProminent)
                    }
                case .capturing:
                    if completedPass {
                        Text("這一圈已拍完。可以再拍一圈、翻轉物件，或完成並重建。")
                            .font(.footnote)
                            .multilineTextAlignment(.center)
                        Button("再拍一圈（不翻轉）") { session.beginNewScanPass() }
                            .buttonStyle(.bordered)
                        Button("翻轉物件後再拍") { session.beginNewScanPassAfterFlip() }
                            .buttonStyle(.bordered)
                        Button("完成拍攝並重建") { finishCapture(session) }
                            .buttonStyle(.borderedProminent)
                    } else {
                        Text("慢慢繞物件移動，讓系統自動拍照。")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                case .finishing:
                    ProgressView("正在儲存相片…")
                case .completed:
                    ProgressView("拍攝完成，準備重建…")
                case .failed(let error):
                    Text("拍攝失敗：\(error.localizedDescription)")
                        .font(.footnote)
                        .foregroundStyle(.red)
                    Button("關閉") { dismiss() }
                        .buttonStyle(.borderedProminent)
                @unknown default:
                    EmptyView()
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(.ultraThinMaterial)
    }

    private func start() async {
        guard ObjectCaptureSession.isSupported else {
            errorMessage = DeviceCapabilities.unsupportedMessage
            return
        }
        do {
            if scanSession.imageCount > 0 || scanSession.modelURL != nil {
                scanSession.startNewScan()
            }
            let folder = try scanSession.ensureFolder()
            let capture = ObjectCaptureSession()
            var configuration = ObjectCaptureSession.Configuration()
            configuration.checkpointDirectory = folder.snapshots
            capture.start(imagesDirectory: folder.images, configuration: configuration)
            session = capture
            if case let .failed(error) = capture.state {
                errorMessage = error.localizedDescription
            }
            Task {
                for await newState in capture.stateUpdates {
                    await MainActor.run {
                        handle(newState, session: capture)
                    }
                }
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func handle(_ newState: ObjectCaptureSession.CaptureState, session: ObjectCaptureSession) {
        poll(session)
        switch newState {
        case .initializing: stateLabel = "初始化"
        case .ready: stateLabel = "準備就緒"
        case .detecting: stateLabel = "偵測範圍"
        case .capturing: stateLabel = "拍攝中"
        case .finishing: stateLabel = "儲存中"
        case .completed:
            stateLabel = "完成"
            completeAndReconstruct()
        case .failed(let error):
            stateLabel = "失敗"
            if case ObjectCaptureSession.Error.cancelled = error {
                dismiss()
            } else {
                errorMessage = error.localizedDescription
            }
        @unknown default:
            stateLabel = "…"
        }
    }

    private func poll(_ session: ObjectCaptureSession?) {
        guard let session else { return }
        shotCount = session.numberOfShotsTaken
        completedPass = session.userCompletedScanPass
        if case .completed = session.state {
            completeAndReconstruct()
        }
    }

    private func finishCapture(_ session: ObjectCaptureSession) {
        session.finish()
    }

    private func completeAndReconstruct() {
        guard !didFinish else { return }
        didFinish = true
        scanSession.noteGuidedCaptureFinished()
        dismiss()
        Task { await scanSession.reconstruct() }
    }

    private func cancelAndClose() {
        session?.cancel()
        dismiss()
    }
}
#endif
