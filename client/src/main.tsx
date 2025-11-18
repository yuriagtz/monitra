import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // データが5分間は新鮮とみなす（staleTime）
      staleTime: 1000 * 60 * 5, // 5分
      // キャッシュを10分間保持（gcTime - 旧cacheTime）
      gcTime: 1000 * 60 * 10, // 10分
      // ウィンドウフォーカス時に再取得しない
      refetchOnWindowFocus: false,
      // マウント時に再取得しない（キャッシュがあれば使用）
      refetchOnMount: false,
      // 再接続時に再取得しない
      refetchOnReconnect: false,
      // エラー時のリトライ回数
      retry: 1,
    },
  },
});

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async fetch(input, init) {
        try {
          const response = await globalThis.fetch(input, {
            ...(init ?? {}),
            credentials: "include",
          });
          
          // Content-Typeを確認して、HTMLが返されている場合はエラーを投げる
          const contentType = response.headers.get("content-type");
          if (contentType && !contentType.includes("application/json")) {
            const text = await response.text();
            console.error("[tRPC] Non-JSON response received:", {
              url: typeof input === "string" ? input : input.url,
              status: response.status,
              statusText: response.statusText,
              contentType,
              bodyPreview: text.substring(0, 200),
            });
            
            // HTMLレスポンスの場合は分かりやすいエラーメッセージを返す
            if (text.trim().toLowerCase().startsWith("<!doctype") || text.trim().toLowerCase().startsWith("<html")) {
              throw new Error("サーバーから予期しないレスポンスが返されました。ページを再読み込みしてください。");
            }
            
            // その他の非JSONレスポンス
            throw new Error(`サーバーエラーが発生しました (${response.status} ${response.statusText})`);
          }
          
          return response;
        } catch (error: any) {
          // JSONパースエラーの場合、より分かりやすいエラーメッセージを返す
          if (error.message?.includes("JSON") || error.message?.includes("<!doctype")) {
            console.error("[tRPC] JSON parse error:", error);
            throw new Error("サーバーから予期しないレスポンスが返されました。ページを再読み込みしてください。");
          }
          throw error;
        }
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
