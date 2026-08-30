import Foundation
import SwiftUI
import UIKit
import Photos
import PhotosUI
import UniformTypeIdentifiers

@MainActor
final class ScanSession: ObservableObject {
    @Published var folder: CaptureFolder?
    @Published var imageCount: Int = 0
    @Published var thumbnails: [UIImage] = []
    @Published var modelURL: URL?
    @Published var heightMM: Double = 280
    @Published var status: String = "尚未掃描"
    @Published var reconstructionProgress: Double = 0
    @Published var reconstructionMessage: String = ""
    @Published var isReconstructing: Bool = false
    @Published var lastError: String?
    @Published var wantsModelTab: Bool = false

    /// Kept for the section placeholder which used to read `images.count`.
    var images: [UIImage] { thumbnails }

    var canReconstruct: Bool { imageCount >= CaptureFolder.hardMinImages }
    var headerBadge: String {
        if isReconstructing { return "重建中" }
        if modelURL != nil { return "已有模型" }
        if imageCount > 0 { return "\(imageCount) 張" }
        return "真機 Object Capture"
    }

    func ensureFolder() throws -> CaptureFolder {
        if let folder { return folder }
        let created = try CaptureFolder.create()
        folder = created
        return created
    }

    func refreshFromDisk() {
        guard let folder else {
            imageCount = 0
            thumbnails = []
            return
        }
        imageCount = folder.imageCount()
        thumbnails = folder.thumbnails()
        if modelURL == nil {
            let share = folder.shareableModelURL()
            let generated = folder.modelOutputURL()
            if FileManager.default.fileExists(atPath: share.path) {
                modelURL = share
            } else if FileManager.default.fileExists(atPath: generated.path) {
                modelURL = generated
            }
        }
        if !isReconstructing {
            status = imageCount == 0 ? "尚未掃描" : "已有 \(imageCount) 張相片"
        }
    }

    func startNewScan() {
        folder = nil
        imageCount = 0
        thumbnails = []
        modelURL = nil
        reconstructionProgress = 0
        reconstructionMessage = ""
        lastError = nil
        isReconstructing = false
        status = "已開始新掃描"
        do {
            folder = try CaptureFolder.create()
            status = "新掃描資料夾已建立"
        } catch {
            lastError = error.localizedDescription
            status = "無法建立掃描資料夾"
        }
    }

    func noteGuidedCaptureFinished() {
        refreshFromDisk()
        status = "引導拍攝完成，共 \(imageCount) 張"
        wantsModelTab = true
    }

    func importPickerItems(_ items: [PhotosPickerItem]) async {
        lastError = nil
        guard !items.isEmpty else { return }
        status = "正在匯入 \(items.count) 張相片…"
        do {
            let folder = try ensureFolder()
            var imported = 0
            for (offset, item) in items.enumerated() {
                status = "匯入相片 \(offset + 1)/\(items.count)…"
                if let dest = try await Self.copyPickerItem(item, into: folder) {
                    imported += 1
                    _ = dest
                }
            }
            refreshFromDisk()
            status = "已從相簿匯入 \(imported) 張，資料夾共 \(imageCount) 張"
            if imported == 0 {
                lastError = "無法讀取所選相片。請允許讀取相簿，或改用引導拍攝。"
            }
        } catch {
            lastError = error.localizedDescription
            status = "匯入失敗"
        }
    }

    func reconstruct() async {
        guard !isReconstructing else { return }
        lastError = nil
        guard DeviceCapabilities.isReconstructionSupported else {
            lastError = DeviceCapabilities.unsupportedMessage
            status = "此環境無法重建"
            return
        }
        guard let folder else {
            lastError = ReconstructionError.noFolder.localizedDescription
            return
        }
        let count = folder.imageCount()
        guard count >= CaptureFolder.hardMinImages else {
            lastError = ReconstructionError.tooFewImages(count).localizedDescription
            status = lastError ?? ""
            return
        }

        isReconstructing = true
        reconstructionProgress = 0
        reconstructionMessage = "準備重建 \(count) 張相片…"
        status = reconstructionMessage
        wantsModelTab = true

        do {
            let url = try await PhotogrammetryRunner.run(folder: folder) { [weak self] fraction, message in
                Task { @MainActor in
                    guard let self else { return }
                    if fraction >= 0 {
                        self.reconstructionProgress = fraction
                    }
                    self.reconstructionMessage = message
                    self.status = message
                }
            }
            modelURL = url
            reconstructionProgress = 1
            reconstructionMessage = "重建完成"
            status = "已輸出 USDZ"
        } catch {
            lastError = error.localizedDescription
            reconstructionMessage = error.localizedDescription
            status = "重建失敗"
        }

        isReconstructing = false
        refreshFromDisk()
    }

    // MARK: - Photo import

    private static func copyPickerItem(_ item: PhotosPickerItem, into folder: CaptureFolder) async throws -> URL? {
        if let identifier = item.itemIdentifier,
           let dest = try await copyPhotoAsset(identifier: identifier, into: folder) {
            return dest
        }
        if let file = try await item.loadTransferable(type: ImportedImageFile.self) {
            let ext = file.url.pathExtension.isEmpty ? "heic" : file.url.pathExtension
            let dest = folder.nextImageURL(pathExtension: ext)
            if FileManager.default.fileExists(atPath: dest.path) {
                try FileManager.default.removeItem(at: dest)
            }
            try FileManager.default.copyItem(at: file.url, to: dest)
            try? FileManager.default.removeItem(at: file.url)
            return dest
        }
        if let data = try await item.loadTransferable(type: Data.self) {
            let ext = Self.guessExtension(for: data)
            let dest = folder.nextImageURL(pathExtension: ext)
            try data.write(to: dest, options: .atomic)
            return dest
        }
        return nil
    }

    private static func copyPhotoAsset(identifier: String, into folder: CaptureFolder) async throws -> URL? {
        let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
        guard status == .authorized || status == .limited else { return nil }

        let result = PHAsset.fetchAssets(withLocalIdentifiers: [identifier], options: nil)
        guard let asset = result.firstObject else { return nil }
        let resources = PHAssetResource.assetResources(for: asset)
        guard let photo = resources.first(where: { $0.type == .photo })
                ?? resources.first(where: { $0.type == .fullSizePhoto })
                ?? resources.first else { return nil }

        let ext = URL(fileURLWithPath: photo.originalFilename).pathExtension
        let dest = folder.nextImageURL(pathExtension: ext.isEmpty ? "heic" : ext)
        if FileManager.default.fileExists(atPath: dest.path) {
            try FileManager.default.removeItem(at: dest)
        }

        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            PHAssetResourceManager.default().writeData(for: photo, toFile: dest, options: options) { error in
                if let error {
                    cont.resume(throwing: error)
                } else {
                    cont.resume()
                }
            }
        }
        return dest
    }

    private static func guessExtension(for data: Data) -> String {
        if data.count >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF {
            return "jpg"
        }
        if data.count >= 8 && data.prefix(8) == Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) {
            return "png"
        }
        return "heic"
    }
}

/// Copies the original image file from PhotosPicker when possible (keeps HEIC).
struct ImportedImageFile: Transferable {
    let url: URL

    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .image) { file in
            SentTransferredFile(file.url)
        } importing: { received in
            let ext = received.file.pathExtension.isEmpty ? "heic" : received.file.pathExtension
            let dest = FileManager.default.temporaryDirectory
                .appendingPathComponent("import-\(UUID().uuidString).\(ext)")
            try FileManager.default.copyItem(at: received.file, to: dest)
            return ImportedImageFile(url: dest)
        }
    }
}
