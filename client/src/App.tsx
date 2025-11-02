import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import LandingPages from "./pages/LandingPages";
import MonitoringHistory from "./pages/MonitoringHistory";
import Settings from "./pages/Settings";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Dashboard} />
        <Route path="/lps" component={LandingPages} />
        <Route path="/history/:id" component={MonitoringHistory} />
        <Route path="/analytics" component={() => <div className="p-6"><h1 className="text-2xl font-bold">分析レポート</h1><p className="text-muted-foreground mt-2">準備中...</p></div>} />
        <Route path="/notifications" component={() => <div className="p-6"><h1 className="text-2xl font-bold">通知設定</h1><p className="text-muted-foreground mt-2">準備中...</p></div>} />
        <Route path="/schedules" component={() => <div className="p-6"><h1 className="text-2xl font-bold">スケジュール設定</h1><p className="text-muted-foreground mt-2">準備中...</p></div>} />
        <Route path="/import-export" component={() => <div className="p-6"><h1 className="text-2xl font-bold">インポート/エクスポート</h1><p className="text-muted-foreground mt-2">準備中...</p></div>} />
        <Route path="/settings" component={Settings} />
        <Route path={"/404"} component={NotFound} />
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
