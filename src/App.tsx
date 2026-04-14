import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { GenerationProvider } from "@/contexts/GenerationContext";
import { GenerationFloatingIndicator } from "@/components/GenerationFloatingIndicator";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import DashboardLayout from "./pages/DashboardLayout";
import DashboardHome from "./pages/DashboardHome";
import GeneratePage from "./pages/GeneratePage";
import DetailDesignPage from "./pages/DetailDesignPage";
import MyImagesPage from "./pages/MyImagesPage";
import PricingPage from "./pages/PricingPage";
import RechargePage from "./pages/RechargePage";
import AccountPage from "./pages/AccountPage";
import EditPage from "./pages/EditPage";
import TranslateImagePage from "./pages/TranslateImagePage";
import AdminPage from "./pages/AdminPage";
import AdminHome from "./pages/AdminHome";
import AdminLayout from "./pages/AdminLayout";
import AdminTasksPage from "./pages/AdminTasksPage";
import AdminImagesPage from "./pages/AdminImagesPage";
import AdminConfigPage from "./pages/AdminConfigPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <GenerationProvider>
            <GenerationFloatingIndicator />
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
          </GenerationProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
