import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { GenerationProvider } from "@/contexts/GenerationContext";
import { GenerationFloatingIndicator } from "@/components/GenerationFloatingIndicator";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";

// Eager: public landing flow — every cold visitor needs these immediately.
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import NotFound from "./pages/NotFound";

// Lazy: only loaded after the user authenticates or navigates into a feature.
// Each chunk is fetched on demand, so the first paint of the landing page
// no longer ships the dashboard or admin code.
const DashboardLayout = lazy(() => import("./pages/DashboardLayout"));
const DashboardHome = lazy(() => import("./pages/DashboardHome"));
const GeneratePage = lazy(() => import("./pages/GeneratePage"));
const DetailDesignPage = lazy(() => import("./pages/DetailDesignPage"));
const MyImagesPage = lazy(() => import("./pages/MyImagesPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const RechargePage = lazy(() => import("./pages/RechargePage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const EditPage = lazy(() => import("./pages/EditPage"));
const TranslateImagePage = lazy(() => import("./pages/TranslateImagePage"));
const AdminLayout = lazy(() => import("./pages/AdminLayout"));
const AdminHome = lazy(() => import("./pages/AdminHome"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AdminTasksPage = lazy(() => import("./pages/AdminTasksPage"));
const AdminImagesPage = lazy(() => import("./pages/AdminImagesPage"));
const AdminConfigPage = lazy(() => import("./pages/AdminConfigPage"));

const queryClient = new QueryClient();

const PageSpinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <GenerationProvider>
            <GenerationFloatingIndicator />
            <Suspense fallback={<PageSpinner />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/auth/callback" element={<AuthCallbackPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<DashboardHome />} />
                  <Route path="generate" element={<GeneratePage />} />
                  <Route path="detail-design" element={<DetailDesignPage />} />
                  <Route path="images" element={<MyImagesPage />} />
                  <Route path="pricing" element={<PricingPage />} />
                  <Route path="recharge" element={<RechargePage />} />
                  <Route path="account" element={<AccountPage />} />
                  <Route path="edit" element={<EditPage />} />
                  <Route path="translate" element={<TranslateImagePage />} />
                </Route>
                <Route
                  path="/admin"
                  element={
                    <AdminRoute>
                      <AdminLayout />
                    </AdminRoute>
                  }
                >
                  <Route index element={<AdminHome />} />
                  <Route path="users" element={<AdminPage />} />
                  <Route path="tasks" element={<AdminTasksPage />} />
                  <Route path="images" element={<AdminImagesPage />} />
                  <Route path="config" element={<AdminConfigPage />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </GenerationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
