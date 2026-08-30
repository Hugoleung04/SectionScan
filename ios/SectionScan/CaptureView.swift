import SwiftUI
import UIKit

struct CaptureView: View {
    @EnvironmentObject var session: ScanSession
    @State private var showCamera = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("繞物件拍攝，直徑建議不超過 2 米。重疊約 60–80%。")
                .foregroundStyle(.secondary)

            Text(session.status)

            ScrollView(.horizontal) {
                HStack {
                    ForEach(Array(session.images.enumerated()), id: \.offset) { _, image in
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(width: 76, height: 76)
                            .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }

            Button("打開相機拍攝") { showCamera = true }
                .buttonStyle(.borderedProminent)

            Button("清空相片") { session.clear() }

            Text("完整重建請用「開始 Object Capture」。需要 iOS 17+，建議 iPhone Pro 以取得真實比例。")
                .font(.footnote)
                .foregroundStyle(.secondary)

            Spacer()
        }
        .padding()
        .sheet(isPresented: $showCamera) {
            CameraPicker { image in
                if let image { session.add(image) }
            }
        }
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    var onImage: (UIImage?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onImage: onImage) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onImage: (UIImage?) -> Void
        init(onImage: @escaping (UIImage?) -> Void) { self.onImage = onImage }
        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            onImage(info[.originalImage] as? UIImage)
            picker.dismiss(animated: true)
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onImage(nil)
            picker.dismiss(animated: true)
        }
    }
}
