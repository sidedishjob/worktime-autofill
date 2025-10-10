# worktime-autofill

平日の空欄に自動で「08:15〜17:15 / 休憩 00:45」を入力する Tampermonkey スクリプト。

## 💡 機能

- 平日の空欄にのみ自動入力（既に値がある日は上書きしません）
- 土日行はスキップ
- ページ側の計算関数 (`reflect_times`) が存在すれば自動反映
- それ以外の場合は blur イベントで入力確定

## 🧩 導入手順

1. Chrome/Edge に [Tampermonkey](https://www.tampermonkey.net/) をインストール
2. 右記 URL を開く(https://raw.githubusercontent.com/sidedishjob/worktime-autofill/main/autofill.user.js)
3. 「インストール」をクリック
4. 対象ページ（例：Levatech の作業報告書修正画面）を開くと自動で入力されます。

## ⚙️ カスタマイズ

```js
const START = "08:15";
const END = "17:15";
const BREAK = "00:45";
```
