# Home v2 實作規格（給 Claude Code）

參考稿：`design/home-v2.html`（HTML Prototype，只用來看樣子與動畫，**不要直接搬程式碼**）
要改的檔案：`screens/HomeScreen.js`（只有這一個）
松鼠圖片：`assets/mascot/*.png`

## 規則
- 只改樣式與動畫，**不要改資料邏輯**：`useWardrobe`、`recommendOutfits`、`toggleFav`、`saveOutfitToCalendar`、天氣抓取（`loadWeather`）維持原本行為。
- **不要改 `utils/outfitRecommender.js`**（組員負責）。
- 動畫用 React Native 內建 `Animated`，`useNativeDriver: true`，只動 `opacity` 與 `transform`。**不要新增套件。**
- Prototype 裡的假資料不要搬：Look 名稱（Soft Morning…）、固定的 22°C、`+1 acorn`、範例衣服圖（cami/cardi/skirt）。
- 推薦結果用真實衣櫃資料；卡片標題用 `LOOK 01 / 02 / 03`，副標列出實際單品類別。

## 分三階段做，每階段做完先在手機測，再 commit

### 第 1 階段：版面與 UI 審查 P0（不含松鼠）
- 次要文字顏色改 `#7A6650`（label），muted `#8C7758`
- 區塊：天氣縮成標題下方一行（圖示＋溫度＋描述），不編號；`01. OCCASION`、`02. TODAY'S EDIT`（拼字是 OCCASION）
- 場合膠囊：四格等寬；選取狀態＝深色框＋淡底 `#EADFCB`，不是實心黑
- 主要按鈕：實心 `#1A120B`、白字、圓角 22、右側箭頭；副標顯示「場合 · 天氣 · 溫度」
- 空狀態：虛線框縮成約 72 高的一行提示
- 推薦卡：寬約 228、圓角 26、白底 `#FBF9F5`、淡陰影；上方 `LOOK 0n` ＋ 場合；下方分頁圓點（目前頁的圓點變長）

### 第 2 階段：動畫（都在 300ms 左右，除非註明）
- 進場：標題兩行由下往上滑出（0.9s，第二行延遲 0.12s）；其他區塊依序淡入上移 18px（每塊間隔 80ms）
- 溫度數字由 0 數到實際溫度（0.9s）
- 場合膠囊按下縮到 0.93，選取時彈一下（0.9 → 1.06 → 1）
- 主要按鈕按下縮到 0.975；推薦中文字換成「Styling your day…」、底部細進度條（用 scaleX，不要動 width）
- 推薦卡出現：三張依序（間隔 90ms）從下方 90px、縮 0.6、淡入到定位；卡內衣服依序彈入
- 有結果後，主要按鈕文字改「Shuffle three more」（先保留按鈕；換一組的 seed 由組員的推薦函式支援，這裡先準備好 `seed` state，每按一次 +1 傳入 `recommendOutfits(..., seed)`，多的參數目前會被忽略，不會壞）
- 「思考中」的等待**最多 800ms**，不要照 Prototype 的 2.1 秒
- 不做：Tab bar 滑入（屬於 App.js 導覽列）、按鈕水波紋、太陽 SVG 光芒旋轉

### 第 3 階段：松鼠（完整版，拆成 4 小步，每步都能單獨 Demo）

**松鼠獨立寫成一個元件 `components/Squirrel.js`**，HomeScreen 只負責告訴它「現在要做什麼」：
`<Squirrel ref={sqRef} perches={perchPositions} />`，對外提供 `goTo(perchName)`、`setPose(pose)`、`celebrate()`、`wake()`。
這樣 HomeScreen 不會變得太長，之後 Calendar 等頁面也能重用。

共通規則：
- 全部用內建 `Animated`，`useNativeDriver: true`，只動 transform 與 opacity
- **松鼠的任何動畫都不能擋住使用者操作**（Prototype 裡的 `busy` 會鎖住按鈕，App 裡不要這樣做）
- 所有 `setTimeout`／`setInterval`／`Animated.loop` 在離開頁面時都要清掉（`useEffect` cleanup），切到其他分頁時暫停
- 停靠點位置用 `onLayout` 取得（取代 Prototype 的 `getBoundingClientRect`）
- 推薦的「思考中」最多 1 秒
- 支援「減少動態效果」：`AccessibilityInfo.isReduceMotionEnabled()` 為 true 時只換姿勢、不跳

#### 3a 姿勢與待機
- 姿勢圖層（同一個框裡疊圖）：
  - idle：`idle_tail`（尾巴擺動）＋ `idle_body`；每 1.8–4.6 秒眨眼一次（疊 `idle_blink` 130ms，25% 機率連眨兩次）；身體 3.2s 呼吸（scaleY 1.022）
  - think：`think_body` ＋ `think_q`（問號上下晃 1s）；身體左右擺 ±2.2°
  - happy：`happy_tail`（快速擺 0.26s）＋ `happy_body` ＋ `happy_spark`（閃爍）
  - acorn：`acorn`
  - sleep：`sleep_body` ＋ `sleep_zzz`（往右上飄、淡出，2.8s 循環）
- 姿勢切換 150ms 淡入淡出
- 大小約 105pt 高（同 Prototype），站在標題右側

#### 3b 移動與跳躍
- 三個停靠點：標題旁（hero）、推薦區上方（head）、推薦框中間（box）
- `goTo`：一小步一小步跳過去（每步約 34px、跳高 16px、220ms），起跳時拉長、落地時壓扁（squash & stretch），影子跟著縮放；往哪邊跳就面向哪邊（scaleX -1／1）
- 進場：從畫面右側跳進來，到標題旁停下，開心跳一下
- `celebrate`：換 happy、原地跳 2 下（每下 430ms、跳高 30px）、震動 `Haptics`，再回 idle

#### 3c 互動與生活感
- 點松鼠：睡著時叫醒（跳一下）；醒著時隨機 happy 或 acorn 跳一下
- 閒置時每 2.4–4.8 秒：一半機率在停靠點附近左右小跳一步，四分之一機率尾巴快速擺動
- 26 秒沒有任何操作（點擊、捲動）就睡著；任何操作都會叫醒

#### 3d 推薦流程演出
- 按「What to wear today」：松鼠跳到推薦框 → 思考姿勢 → 頭上白色泡泡，每 300ms 輪播**使用者衣櫃裡真的衣服**縮圖
- 結果出來：泡泡收起 → 推薦卡發牌 → 松鼠跳到推薦區上方 → celebrate ＋ 彩帶（約 18 片小方塊／圓點，往上噴再落下淡出，顏色用 W2W 的奶油、栗棕色系）
- 存到今天的日記成功時：抱橡果姿勢 ＋ 頭上飄出一行小字（例如「今天也穿得很好」），**不要做 `+1 acorn` 計分**，因為 App 沒有點數系統
