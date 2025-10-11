# worktime-autofill

平日の空欄に「08:15〜17:15 / 休憩 00:45」を自動または手動で入力できる Tampermonkey スクリプト。

## 💡 機能

- **初期値入力ボタン**による手動トリガー対応
- **Alt+I** で未入力セルへ一括入力、**Alt+Shift+I** で全行上書き
- 平日のみ入力（土日行はスキップ）
- **平日の祝日は自動入力をスキップし、作業内容に「祝日\_祝日名」を自動入力**
- **作業内容に「休暇」を含む行は自動入力をスキップ**
- ページ側の計算関数 (`reflect_times`) が存在すれば自動反映
- それ以外の場合は `blur` / `change` イベントで確定
- オプションでページ読み込み時の**自動入力モード**も切り替え可能（`AUTO_ON_LOAD`）

## 🧩 導入手順

1. Chrome/Edge に [Tampermonkey](https://www.tampermonkey.net/) をインストール
2. 下記 URL を開く  
   👉 [https://raw.githubusercontent.com/sidedishjob/worktime-autofill/main/autofill.user.js](https://raw.githubusercontent.com/sidedishjob/worktime-autofill/main/autofill.user.js)
3. 「インストール」をクリック
4. 対象ページ（例：Levtech の作業報告書入力画面）を開く
5. 右上の「初期値入力」ボタン、または **Alt+I** で入力を実行

## ⚙️ カスタマイズ

```js
// 定時を変更したい場合はこの定数を修正
const STANDARD = {
  start: "08:15",
  end: "17:15",
  break: "00:45",
};

// ページ読み込み時に自動入力したい場合は true に変更
const AUTO_ON_LOAD = false;
```
