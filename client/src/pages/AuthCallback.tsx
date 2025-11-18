import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { createClient } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // First, check if there's already a session (user might already be logged in)
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          // User is already authenticated, redirect to dashboard (client-side routing)
          setLocation("/");
          return;
        }

        // Get the URL hash fragment which contains the auth tokens (for OAuth redirects)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          // Set the session using the tokens from the URL (OAuth flow)
          const { data, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (sessionError) {
            console.error("Session error:", sessionError);
            setError("認証に失敗しました: " + sessionError.message);
            setTimeout(() => {
              setLocation("/login");
            }, 2000);
            return;
          }

          if (data.session) {
            // Successfully authenticated, redirect to dashboard (client-side routing)
            setLocation("/");
            return;
          }
        }

        // Check if there's a code parameter for PKCE flow (OAuth)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get("code");
        const type = urlParams.get("type");

        if (code && type) {
          // This is for email confirmation or OAuth callback
          // For email confirmation, use verifyOtp
          if (type === "email" || type === "signup" || type === "recovery") {
            const token_hash = urlParams.get("token_hash");
            if (token_hash) {
              const { data, error: verifyError } = await supabase.auth.verifyOtp({
                type: type as any,
                token_hash,
              });

              if (verifyError) {
                console.error("Verify OTP error:", verifyError);
                setError("認証に失敗しました: " + verifyError.message);
                setTimeout(() => {
                  setLocation("/login");
                }, 2000);
                return;
              }

              if (data.session) {
                setLocation("/");
                return;
              }
            }
          } else {
            // Exchange code for session (PKCE flow for OAuth)
            const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

            if (exchangeError) {
              console.error("Exchange error:", exchangeError);
              // If exchange fails, it might be because we're not in an OAuth flow
              // Check if user is already logged in
              const { data: { session } } = await supabase.auth.getSession();
              if (session) {
                setLocation("/");
                return;
              }
              setError("認証に失敗しました: " + exchangeError.message);
              setTimeout(() => {
                setLocation("/login");
              }, 2000);
              return;
            }

            if (data.session) {
              // Successfully authenticated, redirect to dashboard
              window.location.href = "/";
              return;
            }
          }
        }

        // If we reach here, check if there's a session anyway
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setLocation("/");
          return;
        }

        // No valid auth information found
        setError("認証情報が見つかりませんでした");
        setTimeout(() => {
          setLocation("/login");
        }, 2000);
      } catch (err: any) {
        console.error("Auth callback error:", err);
        // Check if user is logged in despite the error
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setLocation("/");
          return;
        }
        setError("認証処理中にエラーが発生しました: " + err.message);
        setTimeout(() => {
          setLocation("/login");
        }, 2000);
      }
    };

    handleAuthCallback();
  }, [supabase, setLocation]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white">
      <div className="text-center">
        {error ? (
          <>
            <div className="text-red-600 mb-4">{error}</div>
            <p className="text-sm text-muted-foreground">ログインページにリダイレクトします...</p>
          </>
        ) : (
          <>
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">認証を処理しています...</p>
          </>
        )}
      </div>
    </div>
  );
}
