# 独自ログイン機能実装ガイド

**著者**: Manus AI  
**作成日**: 2025年11月3日  
**対象**: LP監視システム

---

## 目次

1. [現在の認証システムの概要](#現在の認証システムの概要)
2. [独自ログイン機能実装に必要な変更点](#独自ログイン機能実装に必要な変更点)
3. [実装手順](#実装手順)
4. [セキュリティ考慮事項](#セキュリティ考慮事項)
5. [テスト方法](#テスト方法)
6. [参考資料](#参考資料)

---

## 現在の認証システムの概要

LP監視システムは現在、**Manus OAuth**を使用した認証システムを採用しています。このシステムでは、ユーザーがManus OAuthプロバイダーを通じてログインし、認証情報がセッションクッキーとして管理されます。

### 認証フロー

現在の認証フローは以下の通りです:

1. **ログインリクエスト**: ユーザーがログインボタンをクリックすると、`getLoginUrl()`関数が生成したManus OAuthのログインURLにリダイレクトされます
2. **OAuth認証**: Manus OAuthプロバイダーがユーザーを認証し、認証コードを発行します
3. **コールバック処理**: `/api/oauth/callback`エンドポイントが認証コードを受け取り、アクセストークンと交換します
4. **ユーザー情報取得**: アクセストークンを使用してユーザー情報(openId、name、emailなど)を取得します
5. **データベース登録**: `upsertUser()`関数を使用して、ユーザー情報をデータベースに保存または更新します
6. **セッション作成**: JWTトークンを生成し、HTTPOnlyクッキーとしてブラウザに保存します
7. **認証完了**: ユーザーがログイン状態になり、保護されたページにアクセスできるようになります

### 関連ファイル

現在の認証システムに関連する主要なファイルは以下の通りです:

| ファイルパス | 役割 |
|------------|------|
| `server/_core/oauth.ts` | OAuth認証ロジック、コールバック処理 |
| `server/_core/context.ts` | tRPCコンテキスト作成、セッション検証 |
| `server/_core/cookies.ts` | クッキー設定の管理 |
| `server/_core/trpc.ts` | `protectedProcedure`の定義 |
| `server/db.ts` | `upsertUser()`、`getUserByOpenId()`関数 |
| `client/src/_core/hooks/useAuth.ts` | フロントエンドの認証フック |
| `client/src/const.ts` | `getLoginUrl()`関数 |
| `drizzle/schema.ts` | usersテーブルのスキーマ定義 |

### データベーススキーマ

現在の`users`テーブルは以下のカラムを持っています:

```typescript
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  password: varchar("password", { length: 255 }), // 独自ログイン用(現在未使用)
  profileImage: text("profileImage"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
```

**重要**: `password`カラムはすでに追加されており、将来の独自ログイン機能実装に備えています。現在はManus OAuthを使用しているため、このカラムは未使用です。

---

## 独自ログイン機能実装に必要な変更点

独自ログイン機能を実装するには、以下の変更が必要です。

### 1. ユーザー登録機能の追加

新規ユーザーがメールアドレスとパスワードでアカウントを作成できるようにする必要があります。

**必要な実装**:
- ユーザー登録フォーム(フロントエンド)
- ユーザー登録API(バックエンド)
- メールアドレスの重複チェック
- パスワードのハッシュ化(bcryptを使用)
- メール確認機能(オプション)

### 2. ログイン機能の追加

メールアドレスとパスワードでログインできるようにする必要があります。

**必要な実装**:
- ログインフォーム(フロントエンド)
- ログインAPI(バックエンド)
- パスワード検証
- セッショントークンの発行

### 3. セッション管理の変更

現在のManus OAuthベースのセッション管理を、独自のセッション管理に変更する必要があります。

**必要な変更**:
- `server/_core/context.ts`: セッション検証ロジックの変更
- `server/_core/oauth.ts`: OAuth依存部分の削除または条件分岐
- `openId`の扱いの変更(Manus OAuth専用から、独自ログイン用のユニークIDに変更)

### 4. パスワードリセット機能の追加

ユーザーがパスワードを忘れた場合の復旧手段を提供する必要があります。

**必要な実装**:
- パスワードリセットリクエストフォーム
- パスワードリセットトークンの生成と保存
- パスワードリセット用のメール送信
- パスワードリセット完了フォーム

### 5. データベーススキーマの拡張

独自ログイン機能に必要な追加情報を保存するため、データベーススキーマを拡張する必要があります。

**追加が推奨されるカラム**:
- `emailVerified`: メールアドレスが確認済みかどうか(boolean)
- `emailVerificationToken`: メール確認用トークン(varchar)
- `passwordResetToken`: パスワードリセット用トークン(varchar)
- `passwordResetExpires`: パスワードリセットトークンの有効期限(timestamp)

### 6. フロントエンドの変更

現在のManus OAuth専用のログインフローを、独自ログインフローに変更する必要があります。

**必要な変更**:
- `client/src/const.ts`: `getLoginUrl()`の削除または条件分岐
- `client/src/_core/hooks/useAuth.ts`: 認証状態の取得方法の変更(必要に応じて)
- 新規ユーザー登録ページの作成
- ログインページの作成
- パスワードリセットページの作成

---

## 実装手順

以下は、独自ログイン機能を実装するための推奨手順です。

### ステップ1: データベーススキーマの拡張

まず、独自ログイン機能に必要なカラムをusersテーブルに追加します。

**drizzle/schema.ts**:

```typescript
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).unique(), // NOT NULL制約を削除
  name: text("name"),
  email: varchar("email", { length: 320 }).notNull().unique(), // UNIQUE制約を追加
  password: varchar("password", { length: 255 }),
  profileImage: text("profileImage"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  emailVerified: int("emailVerified").default(0).notNull(), // 0=未確認, 1=確認済み
  emailVerificationToken: varchar("emailVerificationToken", { length: 255 }),
  passwordResetToken: varchar("passwordResetToken", { length: 255 }),
  passwordResetExpires: timestamp("passwordResetExpires"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
```

**重要な変更点**:
- `openId`: NOT NULL制約を削除(独自ログインユーザーはopenIdを持たないため)
- `email`: UNIQUE制約を追加(メールアドレスでユーザーを識別するため)
- `emailVerified`: メール確認状態を保存
- `emailVerificationToken`: メール確認用トークン
- `passwordResetToken`: パスワードリセット用トークン
- `passwordResetExpires`: パスワードリセットトークンの有効期限

マイグレーションを実行:

```bash
cd /home/ubuntu/lp-monitor
pnpm db:push
```

### ステップ2: ユーザー登録APIの実装

**server/routers.ts**に新しいルーターを追加:

```typescript
import crypto from 'crypto';

// ... 既存のimport ...

export const appRouter = router({
  // ... 既存のルーター ...

  auth: router({
    // ... 既存のauth関連API ...

    register: publicProcedure
      .input(z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        // メールアドレスの重複チェック
        const existingUser = await db.select()
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (existingUser.length > 0) {
          throw new Error('このメールアドレスは既に登録されています');
        }

        // パスワードのハッシュ化
        const hashedPassword = await bcrypt.hash(input.password, 10);

        // メール確認トークンの生成
        const emailVerificationToken = crypto.randomBytes(32).toString('hex');

        // ユーザーの作成
        const [newUser] = await db.insert(users).values({
          name: input.name,
          email: input.email,
          password: hashedPassword,
          loginMethod: 'email',
          emailVerificationToken,
          emailVerified: 0,
          openId: null, // 独自ログインユーザーはopenIdを持たない
        });

        // TODO: メール確認メールを送信
        // await sendVerificationEmail(input.email, emailVerificationToken);

        return { success: true, message: 'ユーザー登録が完了しました。確認メールをご確認ください。' };
      }),

    login: publicProcedure
      .input(z.object({
        email: z.string().email(),
        password: z.string(),
      }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        // メールアドレスでユーザーを検索
        const [user] = await db.select()
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (!user || !user.password) {
          throw new Error('メールアドレスまたはパスワードが正しくありません');
        }

        // パスワードの検証
        const isValid = await bcrypt.compare(input.password, user.password);
        if (!isValid) {
          throw new Error('メールアドレスまたはパスワードが正しくありません');
        }

        // メール確認チェック(オプション)
        if (!user.emailVerified) {
          throw new Error('メールアドレスが確認されていません。確認メールをご確認ください。');
        }

        // 最終ログイン時刻を更新
        await db.update(users)
          .set({ lastSignedIn: new Date() })
          .where(eq(users.id, user.id));

        // セッショントークンを発行
        const token = jwt.sign(
          { userId: user.id, email: user.email },
          process.env.JWT_SECRET!,
          { expiresIn: '7d' }
        );

        // クッキーにセッショントークンを保存
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, token, cookieOptions);

        return { success: true, message: 'ログインしました' };
      }),

    verifyEmail: publicProcedure
      .input(z.object({
        token: z.string(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        // トークンでユーザーを検索
        const [user] = await db.select()
          .from(users)
          .where(eq(users.emailVerificationToken, input.token))
          .limit(1);

        if (!user) {
          throw new Error('無効な確認トークンです');
        }

        // メールアドレスを確認済みに更新
        await db.update(users)
          .set({
            emailVerified: 1,
            emailVerificationToken: null,
          })
          .where(eq(users.id, user.id));

        return { success: true, message: 'メールアドレスが確認されました' };
      }),

    requestPasswordReset: publicProcedure
      .input(z.object({
        email: z.string().email(),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        // メールアドレスでユーザーを検索
        const [user] = await db.select()
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (!user) {
          // セキュリティ上、ユーザーが存在しない場合も成功メッセージを返す
          return { success: true, message: 'パスワードリセットメールを送信しました' };
        }

        // パスワードリセットトークンの生成
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpires = new Date(Date.now() + 3600000); // 1時間後

        // トークンを保存
        await db.update(users)
          .set({
            passwordResetToken: resetToken,
            passwordResetExpires: resetExpires,
          })
          .where(eq(users.id, user.id));

        // TODO: パスワードリセットメールを送信
        // await sendPasswordResetEmail(input.email, resetToken);

        return { success: true, message: 'パスワードリセットメールを送信しました' };
      }),

    resetPassword: publicProcedure
      .input(z.object({
        token: z.string(),
        newPassword: z.string().min(8),
      }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error('Database not available');

        // トークンでユーザーを検索
        const [user] = await db.select()
          .from(users)
          .where(eq(users.passwordResetToken, input.token))
          .limit(1);

        if (!user || !user.passwordResetExpires) {
          throw new Error('無効なリセットトークンです');
        }

        // トークンの有効期限をチェック
        if (new Date() > user.passwordResetExpires) {
          throw new Error('リセットトークンの有効期限が切れています');
        }

        // 新しいパスワードをハッシュ化
        const hashedPassword = await bcrypt.hash(input.newPassword, 10);

        // パスワードを更新し、リセットトークンをクリア
        await db.update(users)
          .set({
            password: hashedPassword,
            passwordResetToken: null,
            passwordResetExpires: null,
          })
          .where(eq(users.id, user.id));

        return { success: true, message: 'パスワードがリセットされました' };
      }),
  }),

  // ... 既存のルーター ...
});
```

**必要な追加import**:

```typescript
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
```

### ステップ3: セッション管理の変更

**server/_core/context.ts**を変更して、独自ログインとManus OAuthの両方に対応:

```typescript
import { inferAsyncReturnType } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import jwt from "jsonwebtoken";
import { COOKIE_NAME } from "@shared/const";
import { ENV } from "./env";
import { getUserByOpenId } from "../db";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const token = req.cookies?.[COOKIE_NAME];

  if (!token) {
    return { req, res, user: null };
  }

  try {
    const decoded = jwt.verify(token, ENV.jwtSecret) as any;

    let user = null;

    // Manus OAuthユーザーの場合
    if (decoded.openId) {
      user = await getUserByOpenId(decoded.openId);
    }
    // 独自ログインユーザーの場合
    else if (decoded.userId) {
      const db = await getDb();
      if (db) {
        const [foundUser] = await db.select()
          .from(users)
          .where(eq(users.id, decoded.userId))
          .limit(1);
        user = foundUser || null;
      }
    }

    return { req, res, user };
  } catch (error) {
    console.error("[Context] Token verification failed:", error);
    return { req, res, user: null };
  }
}

export type Context = inferAsyncReturnType<typeof createContext>;
```

### ステップ4: フロントエンドの実装

**ユーザー登録ページ** (`client/src/pages/Register.tsx`):

```typescript
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Register() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const register = trpc.auth.register.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      setLocation('/login');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('パスワードが一致しません');
      return;
    }

    if (password.length < 8) {
      toast.error('パスワードは8文字以上である必要があります');
      return;
    }

    register.mutate({ name, email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>ユーザー登録</CardTitle>
          <CardDescription>
            アカウントを作成してLP監視システムを利用開始
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">表示名</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田太郎"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8文字以上"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">パスワード(確認)</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="パスワードを再入力"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={register.isPending}
            >
              {register.isPending ? '登録中...' : '登録'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            既にアカウントをお持ちですか？{' '}
            <a href="/login" className="text-primary hover:underline">
              ログイン
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**ログインページ** (`client/src/pages/Login.tsx`):

```typescript
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = trpc.auth.login.useMutation({
    onSuccess: () => {
      toast.success('ログインしました');
      window.location.href = '/'; // ページをリロードして認証状態を更新
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>ログイン</CardTitle>
          <CardDescription>
            メールアドレスとパスワードでログイン
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワード"
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={login.isPending}
            >
              {login.isPending ? 'ログイン中...' : 'ログイン'}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm space-y-2">
            <div>
              <a href="/password-reset" className="text-primary hover:underline">
                パスワードをお忘れですか？
              </a>
            </div>
            <div>
              アカウントをお持ちでないですか？{' '}
              <a href="/register" className="text-primary hover:underline">
                登録
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**App.tsx**にルートを追加:

```typescript
import Register from "./pages/Register";
import Login from "./pages/Login";

function Router() {
  return (
    <Switch>
      <Route path="/register" component={Register} />
      <Route path="/login" component={Login} />
      {/* ... 既存のルート ... */}
    </Switch>
  );
}
```

### ステップ5: メール送信機能の実装(オプション)

メール確認とパスワードリセットのメール送信機能を実装します。

**server/email.ts**を作成:

```typescript
import nodemailer from 'nodemailer';

// SMTPトランスポーターの作成
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendVerificationEmail(email: string, token: string) {
  const verificationUrl = `${process.env.APP_URL}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'メールアドレスの確認',
    html: `
      <h1>メールアドレスの確認</h1>
      <p>以下のリンクをクリックしてメールアドレスを確認してください:</p>
      <a href="${verificationUrl}">${verificationUrl}</a>
      <p>このリンクは24時間有効です。</p>
    `,
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: email,
    subject: 'パスワードのリセット',
    html: `
      <h1>パスワードのリセット</h1>
      <p>以下のリンクをクリックしてパスワードをリセットしてください:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>このリンクは1時間有効です。</p>
    `,
  });
}
```

**必要な環境変数**:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="LP監視システム <noreply@example.com>"
APP_URL=https://your-domain.manus.space
```

**nodemailerのインストール**:

```bash
cd /home/ubuntu/lp-monitor
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

### ステップ6: Manus OAuthとの共存

Manus OAuthと独自ログインを共存させる場合、以下の対応が必要です:

**ログイン画面の選択肢を提供**:

```typescript
export default function Login() {
  // ... 既存のコード ...

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>ログイン</CardTitle>
          <CardDescription>
            メールアドレスまたはManus OAuthでログイン
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* 独自ログインフォーム */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* ... */}
          </form>

          {/* 区切り線 */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                または
              </span>
            </div>
          </div>

          {/* Manus OAuthログインボタン */}
          <Button
            variant="outline"
            className="w-full"
            onClick={() => window.location.href = getLoginUrl()}
          >
            Manus OAuthでログイン
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## セキュリティ考慮事項

独自ログイン機能を実装する際は、以下のセキュリティ対策を必ず実施してください。

### 1. パスワードのハッシュ化

パスワードは**必ずbcryptでハッシュ化**してからデータベースに保存してください。平文でパスワードを保存することは絶対に避けてください。

```typescript
const hashedPassword = await bcrypt.hash(password, 10);
```

bcryptのソルトラウンド数は10以上を推奨します。

### 2. SQLインジェクション対策

Drizzle ORMを使用することで、SQLインジェクションのリスクは大幅に軽減されますが、生のSQLクエリを実行する場合は必ずパラメータ化クエリを使用してください。

### 3. CSRF対策

現在のシステムはHTTPOnlyクッキーを使用しているため、CSRF攻撃のリスクがあります。以下の対策を実施してください:

- **SameSite属性**: クッキーに`SameSite=Lax`または`SameSite=Strict`を設定
- **CSRFトークン**: 重要な操作(パスワード変更、ユーザー削除など)にはCSRFトークンを使用

### 4. レート制限

ブルートフォース攻撃を防ぐため、ログインAPIとパスワードリセットAPIにレート制限を実装してください。

**推奨ライブラリ**: `express-rate-limit`

```typescript
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5, // 最大5回
  message: 'ログイン試行回数が多すぎます。しばらくしてから再度お試しください。',
});

app.post('/api/auth/login', loginLimiter, ...);
```

### 5. メールアドレスの確認

メールアドレスが実際にユーザーのものであることを確認するため、メール確認機能を実装することを強く推奨します。

### 6. パスワードリセットトークンの有効期限

パスワードリセットトークンには必ず有効期限を設定してください。推奨は1時間です。

### 7. HTTPSの使用

本番環境では必ずHTTPSを使用してください。Manus.spaceドメインはデフォルトでHTTPSが有効になっています。

### 8. セッショントークンの有効期限

セッショントークンには適切な有効期限を設定してください。推奨は7日間です。

```typescript
const token = jwt.sign(payload, secret, { expiresIn: '7d' });
```

### 9. パスワードポリシー

強力なパスワードを強制するため、以下のポリシーを実装してください:

- 最小8文字
- 大文字、小文字、数字、記号を含む(推奨)

### 10. ログとモニタリング

不正なログイン試行やセキュリティイベントをログに記録し、モニタリングしてください。

---

## テスト方法

独自ログイン機能を実装した後、以下のテストを実施してください。

### 1. ユーザー登録テスト

- [ ] 有効なメールアドレスとパスワードで登録できる
- [ ] 重複したメールアドレスで登録できない
- [ ] 8文字未満のパスワードで登録できない
- [ ] メール確認メールが送信される(メール送信機能を実装した場合)

### 2. ログインテスト

- [ ] 正しいメールアドレスとパスワードでログインできる
- [ ] 間違ったパスワードでログインできない
- [ ] 存在しないメールアドレスでログインできない
- [ ] メール未確認のユーザーはログインできない(メール確認機能を実装した場合)

### 3. パスワード変更テスト

- [ ] 現在のパスワードが正しい場合、パスワードを変更できる
- [ ] 現在のパスワードが間違っている場合、パスワードを変更できない
- [ ] 8文字未満の新しいパスワードに変更できない

### 4. パスワードリセットテスト

- [ ] パスワードリセットメールが送信される
- [ ] 有効なトークンでパスワードをリセットできる
- [ ] 無効なトークンでパスワードをリセットできない
- [ ] 有効期限切れのトークンでパスワードをリセットできない

### 5. セッション管理テスト

- [ ] ログイン後、保護されたページにアクセスできる
- [ ] ログアウト後、保護されたページにアクセスできない
- [ ] セッショントークンの有効期限が切れた後、再ログインが必要

### 6. セキュリティテスト

- [ ] パスワードがハッシュ化されてデータベースに保存される
- [ ] SQLインジェクション攻撃が防がれる
- [ ] CSRF攻撃が防がれる
- [ ] レート制限が機能する

---

## 参考資料

独自ログイン機能の実装に役立つリソースを以下に示します。

### 公式ドキュメント

- **bcrypt**: [https://github.com/kelektiv/node.bcrypt.js](https://github.com/kelektiv/node.bcrypt.js)
- **jsonwebtoken**: [https://github.com/auth0/node-jsonwebtoken](https://github.com/auth0/node-jsonwebtoken)
- **nodemailer**: [https://nodemailer.com/](https://nodemailer.com/)
- **express-rate-limit**: [https://github.com/express-rate-limit/express-rate-limit](https://github.com/express-rate-limit/express-rate-limit)

### セキュリティベストプラクティス

- **OWASP Authentication Cheat Sheet**: [https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- **OWASP Password Storage Cheat Sheet**: [https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

### 関連技術

- **Drizzle ORM**: [https://orm.drizzle.team/](https://orm.drizzle.team/)
- **tRPC**: [https://trpc.io/](https://trpc.io/)
- **React**: [https://react.dev/](https://react.dev/)

---

## まとめ

このガイドでは、LP監視システムに独自ログイン機能を実装するための手順を詳しく説明しました。現在のManus OAuth認証システムを理解し、独自ログイン機能に必要な変更点を把握することで、スムーズに実装を進めることができます。

**重要なポイント**:

1. **データベーススキーマの拡張**: `password`、`emailVerified`、`emailVerificationToken`、`passwordResetToken`、`passwordResetExpires`カラムを追加
2. **ユーザー登録とログインAPIの実装**: bcryptでパスワードをハッシュ化し、JWTでセッショントークンを発行
3. **セッション管理の変更**: `server/_core/context.ts`を変更して、独自ログインとManus OAuthの両方に対応
4. **フロントエンドの実装**: ユーザー登録、ログイン、パスワードリセットページを作成
5. **セキュリティ対策**: bcrypt、レート制限、CSRF対策、HTTPSを必ず実施

独自ログイン機能を実装することで、ユーザーはManus OAuthに依存せず、メールアドレスとパスワードでシステムにアクセスできるようになります。セキュリティを最優先に考え、ベストプラクティスに従って実装を進めてください。

---

**著者**: Manus AI  
**最終更新**: 2025年11月3日
