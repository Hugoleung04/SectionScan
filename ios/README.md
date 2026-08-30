# 剖形 iOS App（Apple Object Capture）

這不是骨架。這是可在 Xcode 打開、在**真機**跑的 Object Capture 流程：引導拍攝 → `PhotogrammetrySession` 重建 USDZ → RealityKit 預覽 → 系統分享表匯出。

## 用 Xcode 打開

1. 在 Mac 打開 `ios/SectionScan.xcodeproj`（已附完整 `project.pbxproj`，**不需要** XcodeGen。`project.yml` 只是備用。）
2. 上方 target 選 **SectionScan**。
3. **Signing & Capabilities**：選你的 **Team**（個人 Apple ID 即可）。Bundle ID 預設 `com.hugoleung.SectionScan`，若被佔用就改一個。
4. 裝置選**實體 iPhone**，不要選 Simulator。
5. 插線或開開發者模式後按 Run。

第一次會問相機、世界感應（AR／深度）、相簿權限。請允許，否則無法拍攝或匯入。

## 系統與裝置限制（一定要看）

| 項目 | 說明 |
| --- | --- |
| 系統 | iOS 17.0 或以上 |
| 模擬器 | **不能**跑 Object Capture。Simulator SDK 根本沒有這些 API，App 會顯示中文錯誤，**不會假裝成功**。 |
| 引導拍攝 | 需要 `ObjectCaptureSession.isSupported`。實際上幾乎都是 **LiDAR + A14 或更新**（iPhone 12 Pro 或更新 Pro）。 |
| 裝置端重建 | 需要 `PhotogrammetrySession.isSupported`。iOS 上細節等級只有 **`.reduced`**（約 5 萬三角、2K 貼圖）。`.medium` / `.full` 會失敗。 |
| 真實毫米 | 有 LiDAR／深度的 HEIC 才較容易得到真實比例。普通相簿 JPEG 往往只有相對尺寸，到網頁版仍要定標。 |
| RAM | 重建很吃記憶體。請保持 App 在前景、關掉其他佔 RAM 的 App。大物件可能要數分鐘，亦可能因記憶體被系統殺掉。 |
| 物件 | 避免全透明、全鏡面、過薄、會變形的物件。直徑建議不超過約 2 米。 |

## 兩個重建入口

### 1. 引導拍攝（掂描 →「開始引導拍攝」）

1. 真機且支援 LiDAR 才會出現此按鈕。
2. `ObjectCaptureView` 顯示相機與範圍框。
3. **繼續** → 調範圍 → **開始拍攝**，慢慢繞物件，系統自動拍照（HEIC，有深度就一併寫入）。
4. 一圈完成後可：**再拍一圈**、**翻轉後再拍**，或 **完成拍攝並重建**。
5. 相片寫入 App Documents：`Scans/<時間>/Images/`，檢查點在 `Snapshots/`。
6. 完成後自動開 `PhotogrammetrySession`，到「模型」頁看進度。

### 2. 已有相片（相簿多選）

1. 「從相簿揀選已有相片」可一次選一批。
2. App 會盡量複製**原始檔**（HEIC）到同一個 `Images/` 資料夾，而不是只留下壓扁的 JPEG。
3. 至少約 10 張才允許開始（建議 20 張或以上，重疊 60–80%，繞一圈再高低各一圈）。
4. 按「用這批相片重建 3D」或到「模型」頁開始重建。

## 模型與匯出

- 成功後寫入 `Scans/<時間>/Models/model.usdz`，並複製一份 `剖形模型.usdz` 方便分享。
- 「模型」頁用 RealityKit `Model3D` 載入 USDZ。
- **分享／匯出 USDZ** 走 `UIActivityViewController`（AirDrop、檔案、其他 App）。也可用 SwiftUI `ShareLink`。
- 開了 iTunes 檔案共享：在 iPhone「檔案」App → 我的 iPhone → 剖形，可以看到 Scans 資料夾。
- 沒有做 GLB 轉換（避免塞大型轉檔庫）。網頁版截面可先用 USDZ／再另存 GLB。

## 截面

原生切面仍是下一版。請把 USDZ 匯出後，用 Safari 打開網頁 App：

https://hugoleung04.github.io/SectionScan/

## 專案結構

```
ios/SectionScan.xcodeproj   用 Xcode 打開這個
ios/project.yml             XcodeGen 備用（可忽略）
ios/SectionScan/Info.plist  權限字串
ios/SectionScan/*.swift     SwiftUI + Object Capture
```

主要程式：

- `GuidedCaptureView.swift` — `ObjectCaptureSession` + `ObjectCaptureView`
- `PhotogrammetryRunner.swift` — `PhotogrammetrySession` → USDZ
- `CaptureView.swift` — 引導拍攝與相簿匯入
- `ReconstructionView.swift` — 進度、Model3D、分享
