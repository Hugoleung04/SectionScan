# 剖形 SectionScan

用手機拍攝物件、查看 3D 模型、切開橫截面，並以毫米量度外形。

這是第一版。網頁 App 可立刻試用。完整「相片自動重建 3D」需要之後在 Xcode 接上 Apple Object Capture。

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
ios/SectionScan/        iOS SwiftUI 骨架
ios/INFO.plist.notes.txt
serve.sh
```

## 準確度與限制

- 截面是物件外表面被切開的輪廓，不是 CT 內部結構
- 要真實毫米必須先定標（輸入高度，或點兩點輸入已知距離）
- 小物件加定標：常見數毫米誤差
- 接近 2 米：常見 1–3 cm，取決於拍攝與定標
- 網頁版不會把相片直接算成精準 3D 網格；請匯入 GLB，或使用 ios/ 接 Object Capture

## iOS 下一步

用 Xcode 開新 iOS App，把 `ios/SectionScan` 的 Swift 檔加進去，最低 iOS 17。權限說明見 `ios/INFO.plist.notes.txt`。建議 iPhone Pro（有 LiDAR）較容易得到真實比例。

## License

MIT
