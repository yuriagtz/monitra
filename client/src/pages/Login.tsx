import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { APP_LOGO, APP_TITLE } from "@/const";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const utils = trpc.useUtils();

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      // 認証状態のキャッシュを無効化して再取得
      await utils.auth.me.invalidate();
      // 認証状態を再取得してからリダイレクト
      const result = await utils.auth.me.refetch();
      if (result.data) {
        // 認証状態が確認できたらリダイレクト（URLを確実に変更）
        // window.location.replace を使用して、ブラウザの履歴に /login を残さない
        window.location.replace("/dashboard");
      } else {
        // 認証状態が確認できない場合は少し待ってからリダイレクト
        setTimeout(() => {
          window.location.replace("/dashboard");
        }, 500);
      }
    },
    onError: (error: any) => {
      setError(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("メールアドレスを入力してください");
      return;
    }

    if (!password) {
      setError("パスワードを入力してください");
      return;
    }

    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {APP_LOGO && (
              <img
                src={APP_LOGO}
                alt="Logo"
                className="h-12 w-12"
                onError={(e) => {
                  console.error("[Logo] Failed to load image:", APP_LOGO);
                  // Fallback to placeholder if image fails to load
                  e.currentTarget.src = "https://placehold.co/128x128/E1E7EF/1F2937?text=App";
                }}
              />
            )}
          </div>
          <CardTitle className="text-2xl">{APP_TITLE}</CardTitle>
          <CardDescription>
            アカウントにログインしてください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">メールアドレス</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@example.com"
                disabled={loginMutation.isPending}
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
                disabled={loginMutation.isPending}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ログイン中...
                </>
              ) : (
                "ログイン"
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-muted-foreground">
                  または
                </span>
              </div>
            </div>

            <GoogleSignInButton />

            <div className="text-center text-sm">
              <span className="text-muted-foreground">アカウントをお持ちでないですか？ </span>
              <Button
                variant="link"
                className="p-0 h-auto"
                onClick={() => setLocation("/register")}
                type="button"
              >
                新規登録
              </Button>
            </div>

            <div className="text-center">
              <Button
                variant="ghost"
                onClick={() => setLocation("/")}
                type="button"
              >
                トップページに戻る
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
