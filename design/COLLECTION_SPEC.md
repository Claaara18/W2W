# Collection 改版規格（給 Claude Code）

參考稿：Collection Prototype v2（細線圖示版，只參考樣子，**不要搬程式碼**）。
要改的檔案：`context/CollectionContext.js`、`screens/CollectionScreen.js`，以及 `screens/HomeScreen.js`、`screens/MatchScreen.js` 裡「儲存到哪個類別？」面板與 `addLook` 的那幾行。
**不要改**：推薦程式、`CalendarContext`、松鼠、Match 的拖曳／縮放／搖一搖、各頁其他已完成的版面與動畫。不要新增套件（圖示用專案已有的 `@expo/vector-icons` 的 `Feather`）。
**這一頁不放松鼠。不做「今天穿這套」。**

顏色與字體跟其他頁統一：底色 `#F3EEE5`、主文字 `#1A120B`、次要文字 `#7A6650`、淡色 `#8C7758`、線 `#C9B9A6`、卡片 `#FBF9F5`、卡片細框 `#E6DCCD`；標題襯線粗體、小標等寬字。

## 類別規則
- 預設四類，對應 Home 的場合膠囊，**不能改名、不能刪除**：

| id | 名稱 | 底色 | Feather 圖示 |
|---|---|---|---|
| `casual` | Casual | `#E5E1C9` | `coffee` |
| `school` | School | `#DCE6CF` | `book-open` |
| `work` | Work | `#C9D6E5` | `briefcase` |
| `date` | Date | `#E5C9D2` | `heart` |

- 自訂類別：使用者輸入名稱新增；底色從柔和色盤自動輪流分配（`#E8D5C4`、`#D6CFE5`、`#CFE3E0`、`#E5D1C9`、`#C9E5D8`）；圖示統一 `bookmark`。可以改名、可以刪除。名稱不可空白，與既有類別同名（不分大小寫）時不新增。
- 刪除自訂類別：裡面的穿搭移到 Casual，不會不見。

---

## 第 1 階段：資料＋列表頁＋儲存面板

### 1. `CollectionContext`
- 新增 `categories`（預設四類＋自訂類別，依順序）、`addCategory(name)`（回傳新類別）、`renameCategory(id, name)`、`deleteCategory(id)`、`moveLook(fromCatId, toCatId, lookId)`，一起放進 Provider。
- 自訂類別另外存在新的 AsyncStorage key `@w2w_collection_cats`（只存自訂的）。**穿搭本身的儲存格式不變**（仍是 `{ [catId]: Look[] }` 存在原本的 key）。
- **舊資料轉換（只做一次、不能丟資料）**：讀取時如果舊資料裡有 `favorites` 或 `sports` 而且裡面有穿搭，就把它們變成自訂類別（名稱 Favorites／Sports，保留原 id 與穿搭）；如果是空的就不顯示。轉換前沿用現有的 `backupRawOnce` 備份。
- `STYLE_CATEGORIES` 可以保留匯出當作「預設四類」，但畫面一律改讀 `categories`。

### 2. 列表頁（`CollectionScreen` 的 list 狀態）
- 頁首維持：返回箭頭＋「Collection」襯線粗體＋右側總數與等寬小字「SAVED LOOKS」，下方一條細線。
- 每列卡片：左邊 56pt 圓角方塊（類別底色）中間放 Feather 細線圖示（約 24pt、主文字色）；中間是類別名稱（襯線粗體約 22pt）＋下一行等寬小字「2 LOOKS · LATEST NOV 22」（沒有穿搭時顯示「還沒有收藏」）；右邊小箭頭。自訂類別名稱旁加一個小膠囊「CUSTOM」。
- 列表最下面一顆虛線框按鈕「＋ 新增類別」，按下跳出**底部面板**（奶油底、上方圓角、灰色拉桿，跟 Home 的「儲存到哪個類別？」同樣式），裡面一個輸入框＋「新增」按鈕。新增後顯示小提示「已新增 ○○」。
- 拿掉現在的純色方塊。

### 3. Home 與 Match 的「儲存到哪個類別？」面板
- 類別改讀 `categories`（包含自訂類別），每一列左邊用同樣的底色＋細線圖示小方塊。
- 類別多時面板內可以捲動。
- **Home**：把跟目前選擇的場合（`selectedOcc`）同名的類別排第一個，旁邊加小膠囊「推薦場合」。
- 面板最下面加一列「＋ 新增類別」輸入框，新增後直接存進去。
- `addLook` 時多寫一個欄位 `savedAt: Date.now()`，`label` 改存 `null`（名稱由畫面用日期顯示，見第 2 階段）。其他欄位不變。

完成後停下來。

---

## 第 2 階段：類別內頁

1. **頁首**：整條用類別底色；返回箭頭＋細線圖示＋類別名稱（襯線粗體約 44pt）＋右側等寬小字「2 LOOKS」。**拿掉陰影**，底部改一條淡線。自訂類別在標題下方多兩顆小膠囊按鈕「改類別名稱」「刪除類別」（刪除要再按一次確認；預設四類不顯示）。
2. **穿搭卡片**：兩欄；卡片底色統一 `#FBF9F5`＋1px 細框 `#E6DCCD`、圓角 20（**拿掉 `LOOK_BG` 輪流換色**）；卡片下方：
   - 名稱：襯線粗體約 18pt。顯示規則：有自訂 `label` 就顯示 `label`；沒有就顯示存檔日期（`savedAt`，格式 `Nov 22`）。**舊資料**沒有 `savedAt` 的照舊顯示原本的 `label`。
   - 下一行等寬小字列出單品（例如 `TOP · JACKET · SKIRT`）；名稱是自訂的時，前面加日期。
   - 依存檔時間新的在前（沒有 `savedAt` 的排最後）。
3. **「⋯」按鈕**：改成**底部面板**（不要用 `Alert`，Android 最多只能 3 個按鈕）。面板標題是穿搭名稱、副標是單品；三個選項：
   - 改名稱（輸入框，空白就恢復顯示日期）
   - 移到其他類別（再開一個列出 `categories` 的面板，目前類別淡化不可選）
   - 刪除（紅字；按第一次變成「再按一次確定刪除」）
   完成後顯示小提示（「已移到 ○○」「已刪除」）。
4. **空類別**：虛線框裡放該類別的細線圖示（淡色、約 40pt）＋「還沒有收藏的穿搭」＋說明「在首頁推薦卡按 ♡，選『○○』，就會出現在這裡。」＋深色膠囊按鈕「去首頁挑一套」（切到 Home 分頁）。不放松鼠。
5. 動畫（選做，內建 `Animated`、`useNativeDriver: true`）：進入內頁時卡片依序淡入上移（間隔約 40ms）。

完成後停下來。

---

## 完成標準
- 列表頁：四個預設類別有細線圖示；新增「Travel」後出現在最下面、有書籤圖示和 CUSTOM 標記。
- 在 Home 按愛心：面板裡看得到 Travel；目前場合排第一並標「推薦場合」；存完到 Collection 找得到。
- 在 Match 按愛心：面板也看得到 Travel。
- 新存的穿搭名稱顯示今天日期；改名後顯示新名稱。
- 「⋯」→ 移到其他類別、刪除都正常；Android 也看得到全部選項。
- 刪除 Travel 後，裡面的穿搭出現在 Casual。
- 舊資料：原本 Casual、Work、Date 的穿搭都還在；Favorites／Sports 有穿搭的話變成自訂類別，沒有就消失。
- 存到月曆、Calendar 蓋章、Home 與 Match 其他功能照常。