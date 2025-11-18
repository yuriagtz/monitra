import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import LandingPages from "./pages/LandingPages";
import MonitoringHistory from "./pages/MonitoringHistory";
import CreativeHistory from "./pages/CreativeHistory";
import Creatives from "./pages/Creatives";
import Settings from "./pages/Settings";
import Notifications from "./pages/Notifications";
import Schedules from "./pages/Schedules";
import ImportExport from "./pages/ImportExport";
import Analytics from "./pages/Analytics";
import Landing from "./pages/Landing";
import Register from "./pages/Register";
import Login from "./pages/Login";
import AuthCallback from "./pages/AuthCallback";
import { useAuth } from "./_core/hooks/useAuth";
import { Loader2 } from "lucide-react";

// ログイン済みユーザーが /login にアクセスした場合に / にリダイレクトするコンポーネント
function LoginRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/");
  }, [setLocation]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );
}

// 認証済みユーザーが /dashboard にアクセスした場合に / にリダイレクトするコンポーネント
function DashboardRedirect() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/");
  }, [setLocation]);
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );
}

function ProtectedRoutes() {
  const { user, loading, refresh } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  // If not authenticated, show landing page
  // But allow access to auth routes (login, register, callback)
  if (!user) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/register" component={Register} />
        <Route path="/login" component={Login} />
        <Route path="/auth/callback" component={AuthCallback} />
        <Route component={Landing} />
      </Switch>
    );
  }

  // If authenticated, show dashboard
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        {/* /dashboard にアクセスした場合は / にリダイレクト */}
        <Route path="/dashboard" component={DashboardRedirect} />
        {/* ログイン済みで /login にアクセスした場合は / にリダイレクト */}
        <Route path="/login" component={LoginRedirect} />
        <Route path="/landing-pages" component={LandingPages} />
        <Route path="/history/:id" component={MonitoringHistory} />
        <Route path="/creatives" component={Creatives} />
        <Route path="/history/creative/:id" component={CreativeHistory} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/notifications" component={Notifications} />
        <Route path="/schedules" component={Schedules} />
        <Route path="/export" component={ImportExport} />
        <Route path="/settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <ProtectedRoutes />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
