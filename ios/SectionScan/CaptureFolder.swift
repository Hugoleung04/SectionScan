import Foundation
import ImageIO
import UIKit

/// On-disk layout for one scan: Images / Snapshots / Models under Documents/Scans/.
struct CaptureFolder: Equatable {
    let root: URL
    let images: URL
    let snapshots: URL
    let models: URL

    static let recommendedMinImages = 20
    static let hardMinImages = 10

    static func create() throws -> CaptureFolder {
        let docs = try FileManager.default.url(
            for: .documentDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let scansRoot = docs.appendingPathComponent("Scans", isDirectory: true)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let name = formatter.string(from: Date()).replacingOccurrences(of: ":", with: "-")
        let root = scansRoot.appendingPathComponent(name, isDirectory: true)
        let images = root.appendingPathComponent("Images", isDirectory: true)
        let snapshots = root.appendingPathComponent("Snapshots", isDirectory: true)
        let models = root.appendingPathComponent("Models", isDirectory: true)
        for url in [images, snapshots, models] {
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        }
        return CaptureFolder(root: root, images: images, snapshots: snapshots, models: models)
    }

    func modelOutputURL() -> URL {
        models.appendingPathComponent("model.usdz")
    }

    func shareableModelURL() -> URL {
        root.appendingPathComponent("剖形模型.usdz")
    }

    func imageURLs() -> [URL] {
        let allowed: Set<String> = ["heic", "heif", "jpg", "jpeg", "png", "tif", "tiff", "dng"]
        let urls = (try? FileManager.default.contentsOfDirectory(
            at: images,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        )) ?? []
        return urls
            .filter { allowed.contains($0.pathExtension.lowercased()) }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
    }

    func imageCount() -> Int { imageURLs().count }

    func nextImageURL(pathExtension: String) -> URL {
        let index = imageCount() + 1
        let ext = pathExtension.lowercased().isEmpty ? "heic" : pathExtension.lowercased()
        return images.appendingPathComponent(String(format: "IMG_%04d.%@", index, ext))
    }

    func thumbnails(maxCount: Int = 24, maxPixel: CGFloat = 160) -> [UIImage] {
        Array(imageURLs().prefix(maxCount)).compactMap { Self.thumbnail(from: $0, maxPixel: maxPixel) }
    }

    static func thumbnail(from url: URL, maxPixel: CGFloat) -> UIImage? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixel,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
            return nil
        }
        return UIImage(cgImage: cg)
    }
}
