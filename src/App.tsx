import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { GenerationProvider } from "@/contexts/GenerationContext";
import { GenerationFloatingIndicator } from "@/components/GenerationFloatingIndicator";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import DashboardLayout from "./pages/DashboardLayout";
import DashboardHome from "./pages/DashboardHome";
import GeneratePage from "./pages/GeneratePage";
import MyImagesPage from "./pages/MyImagesPage";
import PricingPage from "./pages/PricingPage";
import RechargePage from "./pages/RechargePage";
import AccountPage from "./pages/AccountPage";
import EditPage from "./pages/EditPage";
import TranslateImagePage from "./pages/TranslateImagePage";
import AdminPage from "./pages/AdminPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
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
              <Route path="/reset-password" element={<ResetPasswordPage />} />
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
                <Route path="images" element={<MyImagesPage />} />
                <Route path="pricing" element={<PricingPage />} />
                <Route path="recharge" element={<RechargePage />} />
                <Route path="account" element={<AccountPage />} />
                <Route path="edit" element={<EditPage />} />
                <Route path="translate" element={<TranslateImagePage />} />
                <Route path="admin" element={<AdminPage />} />
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
