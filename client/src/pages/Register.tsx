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
import { createClient } from "@/lib/supabase";

export default function Register() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const utils = trpc.useUtils();
  const supabase = createClient();
  
  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async (data) => {
      // If email confirmation is required, show message
      if (data.requiresEmailConfirmation) {
        setError("登録に成功しました。メールを確認してログインしてください。");
        setTimeout(() => {
          setLocation("/login");
        }, 3000);
        return;
      }

      // After server-side registration, sign in on client side to ensure session is set
      try {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email,
          password: password,
        });

        if (signInError) {
          console.error("[Auth] Client-side sign-in after registration failed:", signInError);
          setError("登録は成功しましたが、自動ログインに失敗しました。ログインページからログインしてください。");
          setTimeout(() => {
            setLocation("/login");
          }, 3000);
          return;
        }

        if (!signInData.session) {
          setError("登録は成功しましたが、セッションの作成に失敗しました。ログインページからログインしてください。");
          setTimeout(() => {
            setLocation("/login");
          }, 3000);
          return;
        }

        // Invalidate and refetch auth state to update the UI
        await utils.auth.me.invalidate();
        // 認証状態を再取得してからリダイレクト
        const result = await utils.auth.me.refetch();
        if (result.data) {
          // 認証状態が確認できたらクライアントサイドルーティングで遷移（再読み込みなし）
          setLocation("/");
        } else {
          // 認証状態が確認できない場合は少し待ってからリダイレクト
          setTimeout(() => {
            setLocation("/");
          }, 500);
        }
      } catch (err: any) {
        console.error("[Auth] Error during post-registration sign-in:", err);
        setError("登録は成功しましたが、ログイン処理中にエラーが発生しました。ログインページからログインしてください。");
        setTimeout(() => {
          setLocation("/login");
        }, 3000);
      }
    },
    onError: (error: any) => {
      setError(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("名前を入力してください");
      return;
    }

    if (!email.trim()) {
      setError("メールアドレスを入力してください");
      return;
    }

    if (password.length < 8) {
      setError("パスワードは8文字以上である必要があります");
      return;
    }

    if (password !== confirmPassword) {
      setError("パスワードが一致しません");
      return;
    }

    registerMutation.mutate({ name, email, password });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {APP_LOGO && <img src={APP_LOGO} alt="Logo" className="h-12 w-12" />}
          </div>
          <CardTitle className="text-2xl">{APP_TITLE}</CardTitle>
          <CardDescription>
            アカウントを作成して、LP監視を始めましょう
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
              <Label htmlFor="name">名前</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田太郎"
                disabled={registerMutation.isPending}
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
                disabled={registerMutation.isPending}
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
                disabled={registerMutation.isPending}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">パスワード（確認）</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="パスワードを再入力"
                disabled={registerMutation.isPending}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  登録中...
                </>
              ) : (
                "アカウントを作成"
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
              <span className="text-muted-foreground">すでにアカウントをお持ちですか？ </span>
              <Button
                variant="link"
                className="p-0 h-auto"
                onClick={() => setLocation("/login")}
                type="button"
              >
                ログイン
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
