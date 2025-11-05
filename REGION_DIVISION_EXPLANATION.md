# 上部・中部・下部の区分け方法

## 区分けロジック（`server/monitoring.ts:256-294`）

### 基本的な方法
画像の高さを**縦に3等分**して、上部・中部・下部に分けています。

```typescript
// 画像の高さを3等分
const regionHeight = Math.floor(height / 3);

// 上部：y = 0 から y = regionHeight まで
// Top third (first view)
for (let y = 0; y < regionHeight; y++) {
  // 差分ピクセルをカウント
}

// 中部：y = regionHeight から y = regionHeight * 2 まで
// Middle third
for (let y = regionHeight; y < regionHeight * 2; y++) {
  // 差分ピクセルをカウント
}

// 下部：y = regionHeight * 2 から y = height まで
// Bottom third
for (let y = regionHeight * 2; y < height; y++) {
  // 差分ピクセルをカウント
}
```

### 具体的な例

画像の高さが `height = 3000px` の場合：

- **上部**: y = 0 ～ 999px（最初の1/3）
- **中部**: y = 1000 ～ 1999px（中間の1/3）
- **下部**: y = 2000 ～ 2999px（最後の1/3）

### 差分の計算方法

各領域で、差分画像（diff image）の赤色ピクセル（RGB: 255, 0, 0）をカウントします。

```typescript
// 赤色ピクセルを検出
if (diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 0) {
  topDiffPixels++;
}
```

各領域の差分率は以下のように計算されます：

```typescript
// 上部の差分率
const topThird = (topDiffPixels / (width * regionHeight)) * 100;

// 中部の差分率
const middleThird = (middleDiffPixels / (width * regionHeight)) * 100;

// 下部の差分率（下部は残りの高さなので計算が異なる）
const bottomThird = (bottomDiffPixels / (width * (height - regionHeight * 2))) * 100;
```

### 注意点

1. **均等な3等分**: ページの高さに関係なく、常に3等分しています
2. **ファーストビューとの関係**: 上部は「ファーストビュー（最初に見える部分）」として扱われています
3. **下部の計算**: 下部は `height - regionHeight * 2` の高さになるため、計算が少し異なります（端数の処理）

### 改善の余地

現在の実装では、ページの高さに関係なく3等分していますが、以下のような改善案も考えられます：

1. **固定高さでの区分**: 上部を固定高さ（例：800px）にして、ファーストビューをより正確に捉える
2. **動的な区分**: ページの内容構造を解析して、より意味のある領域で区分する
3. **比率の調整**: 上部を少し大きく（例：40%）、中部・下部を30%ずつにする

