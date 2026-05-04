import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute";
import BrandLayout from "./components/BrandLayout";
import TeamLayout from "./components/TeamLayout";

// Pages – Public / Gateway
import GatewayEntry from "./pages/GatewayEntry";
import LeadQualifier from "./pages/LeadQualifier";
import Stage2Wizard from "./pages/Stage2Wizard";
import NdaNext from "./pages/NdaNext";
import BrandAuth from "./pages/BrandAuth";
import TeamAuth from "./pages/TeamAuth";
import AcceptInvite from "./pages/AcceptInvite";
import AccessPending from "./pages/AccessPending";
import NotFound from "./pages/NotFound";

// Pages – Brand Portal
import BrandPortal from "./pages/BrandPortal";
import Projects from "./pages/Projects";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import ProjectCreationFlow from "./pages/ProjectCreationFlow";
import ProductRequestForm from "./pages/ProductRequestForm";
import PrfStartup from "./pages/PrfStartup";
import PrfEstablished from "./pages/PrfEstablished";
import PrivateLabel from "./pages/PrivateLabel";
import ProductSpecSheet from "./pages/ProductSpecSheet";
import Resources from "./pages/Resources";
import Account from "./pages/Account";
import Concepts from "./pages/Concepts";
import Ingredients from "./pages/Ingredients";
import BakedGoods from "./pages/BakedGoods";
import Formulas from "./pages/Formulas";
import ShelfLife from "./pages/ShelfLife";
import Packaging from "./pages/Packaging";
import ShelfLifeScience from "./pages/ShelfLifeScience";
import ShelfLifeTestingValidation from "./pages/ShelfLifeTestingValidation";
import ShelfLifeTestingGuide from "./pages/ShelfLifeTestingGuide";
import FunctionalIngredientsShelfLife from "./pages/FunctionalIngredientsShelfLife";
import PackagingBarriersMaterials from "./pages/PackagingBarriersMaterials";
import Pricing from "./pages/Pricing";

// Pages – AB Team Portal
import AdminPortal from "./pages/AdminPortal";
import AdminDashboard from "./pages/AdminDashboard";
import AddClientFlow from "./pages/AddClientFlow";
import ClientDetail from "./pages/ClientDetail";
import TeamMemberDetail from "./pages/TeamMemberDetail";
import Costing from "./pages/Costing";
import OperationsHub from "./pages/OperationsHub";
import FounderDashboard from "./pages/FounderDashboard";
import StaffAccount from "./pages/StaffAccount";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* ========== PUBLIC / GATEWAY ========== */}
          <Route path="/apply" element={<GatewayEntry />} />
          <Route path="/" element={<Navigate to="/team" replace />} />
          <Route path="/lead-qualifier" element={<LeadQualifier />} />
          <Route path="/stage2" element={<Stage2Wizard />} />
          <Route path="/nda-next" element={<NdaNext />} />
          <Route path="/brand" element={<BrandAuth />} />
          <Route path="/team" element={<TeamAuth />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/access-pending" element={<AccessPending />} />
          <Route path="/prf-startup" element={<PrfStartup />} />
          <Route path="/prf-established" element={<PrfEstablished />} />

          {/* ========== PORTAL 1: BRAND PORTAL ========== */}
          <Route path="/brand-portal" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]} requireClientAccess={false}>
              <BrandLayout><BrandPortal /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/projects" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><Projects /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/project/new" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <ProjectCreationFlow />
            </ProtectedRoute>
          } />
          <Route path="/project/:id/*" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <ProjectWorkspace />
            </ProtectedRoute>
          } />
          <Route path="/product-request-form" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><ProductRequestForm /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/private-label" element={<PrivateLabel />} />
          <Route path="/product-spec-sheet" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><ProductSpecSheet /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/resources" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><Resources /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/account" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><Account /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/services-pricing" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]} requireClientAccess={false}>
              <BrandLayout><Pricing /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/concepts" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><Concepts /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/ingredients" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><Ingredients /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/formulas" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><Formulas /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/baked-goods" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><BakedGoods /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/shelf-life" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><ShelfLife /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/packaging" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><Packaging /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/costing" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><Costing /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/resource/shelf-life-science" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><ShelfLifeScience /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/resource/shelf-life-testing-validation" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><ShelfLifeTestingValidation /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/resource/shelf-life-testing-guide" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><ShelfLifeTestingGuide /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/resource/functional-ingredients-shelf-life" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><FunctionalIngredientsShelfLife /></BrandLayout>
            </ProtectedRoute>
          } />
          <Route path="/resource/packaging-barriers-materials" element={
            <ProtectedRoute allowedRoles={["user", "admin", "staff"]}>
              <BrandLayout><PackagingBarriersMaterials /></BrandLayout>
            </ProtectedRoute>
          } />

          {/* ========== PORTAL 2: AB TEAM PORTAL ========== */}
          <Route path="/team/dashboard" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><AdminDashboard /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/admin" element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <TeamLayout><AdminPortal /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/customers" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><AdminDashboard /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/client/new" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <AddClientFlow />
            </ProtectedRoute>
          } />
          <Route path="/team/client/:userId" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><ClientDetail /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/member/:userId" element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <TeamLayout><TeamMemberDetail /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/product-request" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><ProductRequestForm /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/nda-submissions" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><NdaNext /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/spec-sheets" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><ProductSpecSheet /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/costing" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><Costing /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/formulas" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><Formulas /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/sourcing" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><Ingredients /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/production" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><OperationsHub /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/reports" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><FounderDashboard /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/operations-hub" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><OperationsHub /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/account" element={
            <ProtectedRoute allowedRoles={["admin", "staff"]}>
              <TeamLayout><StaffAccount /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/settings" element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <TeamLayout><AdminPortal /></TeamLayout>
            </ProtectedRoute>
          } />
          <Route path="/team/founder" element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <TeamLayout><FounderDashboard /></TeamLayout>
            </ProtectedRoute>
          } />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
