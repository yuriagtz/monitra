# パフォーマンス最適化ガイド

## 現状の問題点

LP管理ページなどの読み込みが重い原因として、以下が考えられます：

1. **データベースクエリの最適化不足**
2. **複数のクエリが並行実行されている**
3. **インデックスの不足**
4. **不要なデータの取得**

## 改善提案

### 1. データベースインデックスの追加

`landing_pages`テーブルに`userId`のインデックスを追加することで、クエリ速度が大幅に向上します。

```sql
-- マイグレーションファイルを作成して実行
CREATE INDEX IF NOT EXISTS idx_landing_pages_userId ON landing_pages(userId);
```

### 2. クエリの最適化

`getLandingPagesByUserId`関数で、必要なカラムのみを取得するように最適化：

```typescript
// server/db.ts
export async function getLandingPagesByUserId(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  // SELECT * ではなく、必要なカラムのみを取得
  const landingPagesResult = await db
    .select({
      id: landingPages.id,
      url: landingPages.url,
      title: landingPages.title,
      description: landingPages.description,
      userId: landingPages.userId,
      createdAt: landingPages.createdAt,
      updatedAt: landingPages.updatedAt,
    })
    .from(landingPages)
    .where(eq(landingPages.userId, userId))
    .orderBy(desc(landingPages.updatedAt)); // 更新日時でソート（最新順）
  
  return landingPagesResult.map(landingPage => ({
    ...landingPage,
    title: landingPage.title && landingPage.title.trim() !== "" ? landingPage.title : "無題"
  }));
}
```

### 3. フロントエンドの最適化

#### 3.1 クエリの統合

複数のクエリを1つのクエリに統合することで、リクエスト数を減らします：

```typescript
// server/routers.ts
landingPages: router({
  listWithTags: protectedProcedure.query(async ({ ctx }) => {
    const landingPages = await db.getLandingPagesByUserId(ctx.user.id);
    const tags = await db.getTagsByUserId(ctx.user.id);
    const lpTagRelations = await db.getLPTagRelationsByUserId(ctx.user.id);
    
    return {
      landingPages,
      tags,
      lpTagRelations,
    };
  }),
}),
```

#### 3.2 ページネーションの実装

大量のLPがある場合、ページネーションを実装：

```typescript
list: protectedProcedure
  .input(z.object({
    page: z.number().min(1).default(1),
    pageSize: z.number().min(1).max(100).default(20),
  }))
  .query(async ({ ctx, input }) => {
    const offset = (input.page - 1) * input.pageSize;
    return await db.getLandingPagesByUserId(ctx.user.id, {
      limit: input.pageSize,
      offset,
    });
  }),
```

### 4. キャッシュ戦略の強化

#### 4.1 React Queryのキャッシュ設定

```typescript
// client/src/pages/LandingPages.tsx
const { data: landingPages, isLoading } = trpc.landingPages.list.useQuery(undefined, {
  staleTime: 1000 * 60 * 10, // 10分間キャッシュ
  cacheTime: 1000 * 60 * 30, // 30分間メモリに保持
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false, // ネットワーク再接続時も再取得しない
});
```

#### 4.2 Vercel Edge Cacheの活用

APIルートにキャッシュヘッダーを追加：

```typescript
// server/routers.ts
landingPages: router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const data = await db.getLandingPagesByUserId(ctx.user.id);
    
    // レスポンスヘッダーにキャッシュ設定（Vercel Edge Cache）
    if (ctx.res) {
      ctx.res.setHeader('Cache-Control', 'private, max-age=600'); // 10分間キャッシュ
    }
    
    return data;
  }),
}),
```

### 5. データベース接続プールの最適化

Supabaseの接続プール設定を確認・最適化：

```typescript
// server/_core/supabase.ts
// 接続プールサイズを適切に設定
const poolConfig = {
  max: 20, // 最大接続数
  min: 5,  // 最小接続数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};
```

### 6. 不要なデータ取得の削減

監視履歴などの詳細データは、必要になった時点で取得（遅延読み込み）：

```typescript
// 一覧表示時は基本情報のみ
const { data: landingPages } = trpc.landingPages.list.useQuery();

// 詳細表示時のみ履歴を取得
const { data: history } = trpc.monitoring.recent.useQuery(
  { landingPageId: selectedId },
  { enabled: !!selectedId } // selectedIdがある場合のみ実行
);
```

### 7. 画像の最適化

スクリーンショット画像の読み込みを最適化：

- サムネイル画像を使用
- 遅延読み込み（lazy loading）
- WebP形式への変換

### 8. バンドルサイズの最適化

- コード分割（Code Splitting）
- 不要なライブラリの削除
- Tree Shakingの確認

## 実装優先順位

1. **高優先度（即座に実装）**
   - データベースインデックスの追加
   - クエリの最適化（必要なカラムのみ取得）
   - キャッシュ戦略の強化

2. **中優先度（短期間で実装）**
   - クエリの統合
   - ページネーションの実装
   - 不要なデータ取得の削減

3. **低優先度（長期的に検討）**
   - 画像の最適化
   - バンドルサイズの最適化

## 測定方法

パフォーマンス改善の効果を測定：

1. **Lighthouseスコア**の確認
2. **Networkタブ**でリクエスト数とレスポンス時間を確認
3. **React DevTools Profiler**でレンダリング時間を測定
4. **Supabase Dashboard**でクエリ実行時間を確認

## 参考資料

- [Vercel Edge Cache](https://vercel.com/docs/concepts/edge-network/caching)
- [React Query Best Practices](https://tanstack.com/query/latest/docs/react/guides/important-defaults)
- [PostgreSQL Indexing](https://www.postgresql.org/docs/current/indexes.html)

