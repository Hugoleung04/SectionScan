import Foundation
import SwiftUI
import UIKit

final class ScanSession: ObservableObject {
    @Published var images: [UIImage] = []
    @Published var modelURL: URL?
    @Published var heightMM: Double = 280
    @Published var status: String = "尚未掃描"

    var canReconstruct: Bool { images.count >= 20 }

    func add(_ image: UIImage) {
        images.append(image)
        status = "已拍攝 \(images.count) 張"
    }

    func clear() {
        images.removeAll()
        modelURL = nil
        status = "已清空"
    }
}
