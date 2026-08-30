# 剖形 SectionScan

用手機拍攝物件、查看 3D 模型、切開橫截面，並以毫米量度外形。

這是第一版。網頁 App 可立刻試用。iOS 原生 App 已接上 Apple Object Capture：在 Mac 用 Xcode 打開 `ios/SectionScan.xcodeproj`，於真機拍攝或匯入相片，重建 USDZ。

## 現在就能做的事

- 用 iPhone 拍攝或加入多張相片
- 載入示範模型（花瓶／箱／碗）練習切面
- 匯入 GLB（Polycam、Scaniverse、RealityScan 匯出檔）
- 移動 X / Y / Z 切面
- 看 2D 截面輪廓與寬高（mm）
- 用模型總高或兩點距離定標
- 在截面上點兩點量距離
- 匯出截面 SVG

## 用 GitHub Pages 立刻在 iPhone 打開

1. 到 GitHub 按 **New repository**
2. Repository name 可用 `SectionScan`
3. 不要勾 README（這個壓縮包已有）
4. 建立後按 **uploading an existing file**
5. 把解壓後資料夾**裡面的所有檔案**拖上去（包含 `index.html`、`css`、`js`、`README.md`）
6. Commit
7. 打開 **Settings → Pages**
8. Source 選 **Deploy from a branch**
9. Branch 選 `main`，資料夾選 `/ (root)`
10. Save，等 1–2 分鐘
11. 用 iPhone Safari 打開：

`https://你的帳號.github.io/SectionScan/`

必須用 https 網址。不要直接雙擊 `index.html`，模組與 3D 庫會載入失敗。

## 在電腦本機測試

```bash
cd SectionScan
python3 -m http.server 8080
```

瀏覽器打開 http://127.0.0.1:8080

## 專案結構

```
index.html              網頁 App 入口
css/app.css
js/app.js
js/viewer.js
js/section.js           切面求交演算法
ios/SectionScan.xcodeproj  iOS 原生 App（Object Capture）
ios/SectionScan/        SwiftUI + Photogrammetry
ios/README.md           真機執行、權限、限制
serve.sh
```

## 準確度與限制

- 截面是物件外表面被切開的輪廓，不是 CT 內部結構
- 要真實毫米必須先定標（輸入高度，或點兩點輸入已知距離）
- 小物件加定標：常見數毫米誤差
- 接近 2 米：常見 1–3 cm，取決於拍攝與定標
- 網頁版不會把相片直接算成精準 3D 網格；請匯入 GLB，或用 iOS App（`ios/SectionScan.xcodeproj`）做 Object Capture

## iOS App（Apple Object Capture）

已不是骨架。在 Mac 用 Xcode 打開 **`ios/SectionScan.xcodeproj`**，Signing 選 Team，插上 iPhone（iOS 17+，建議 Pro／LiDAR）執行。模擬器不能重建 3D。

- 掂描：系統引導拍攝（`ObjectCaptureSession`），或從相簿一次揀一批相片
- 模型：`PhotogrammetrySession` 輸出 USDZ，RealityKit 預覽，系統分享表 AirDrop／檔案
- 截面：仍用網頁版（把 USDZ 匯出後匯入）

詳細步驟與限制見 `ios/README.md`。

## License

MIT
