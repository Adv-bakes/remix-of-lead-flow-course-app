import { ReactNode, useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Home, Users, FileText, Kanban, Package, Boxes, Bot, TrendingUp,
  ClipboardCheck, ShieldCheck, GraduationCap, UserSquare2, BookOpen,
  ListTodo, Inbox, DollarSign, Database, Settings, User as UserIcon,
  LogOut, PanelLeftClose, PanelLeft, Calendar, ListChecks, Archive,
} from "lucide-react";
import { toast } from "sonner";
import { User } from "@supabase/supabase-js";
import logo from "@/assets/logo.png";
import { CoachChat } from "@/components/CoachChat";
import { useUserRole } from "@/hooks/useUserRole";

interface TeamLayoutProps { children: ReactNode; }
interface NavItem { path: string; icon: React.ElementType; label: string; ownerOnly?: boolean; }
interface NavSection { title: string; items: NavItem[]; }

const navSections: NavSection[] = [
  { title: "Home", items: [{ path: "/team/dashboard", icon: Home, label: "Dashboard" }] },
  { title: "Sales", items: [
    { path: "/team/sales/dashboard", icon: Home, label: "Dashboard" },
    { path: "/team/sales/inbox", icon: FileText, label: "Documents Inbox" },
    { path: "/team/sales/archive", icon: Archive, label: "Archive" },
  ]},
  { title: "Operations", items: [
    { path: "/team/ops/pipeline", icon: Kanban, label: "Pipeline" },
    { path: "/team/ops/orders", icon: Package, label: "Orders" },
    { path: "/team/ops/schedule", icon: Calendar, label: "Schedule" },
    { path: "/team/ops/batches", icon: ListChecks, label: "Batch Tracker" },
    { path: "/team/operations/batch-sheets", icon: FileText, label: "Batch Sheets" },
    { path: "/team/ops/inventory", icon: Boxes, label: "Inventory" },
    { path: "/team/ops/scout-bot", icon: Bot, label: "Scout Bot" },
    { path: "/team/ops/variance", icon: TrendingUp, label: "Variance" },
  ]},
  { title: "Compliance", items: [
    { path: "/team/compliance/sops", icon: BookOpen, label: "SOPs Library" },
    { path: "/team/compliance/traceability", icon: ClipboardCheck, label: "Traceability" },
    { path: "/team/compliance/certifications", icon: ShieldCheck, label: "Certifications" },
  ]},
  { title: "HR", items: [
    { path: "/team/hr/directory", icon: UserSquare2, label: "Team Directory" },
    { path: "/team/hr/trainings", icon: GraduationCap, label: "Training & SOPs" },
    { path: "/team/hr/traceability", icon: ListTodo, label: "Traceability" },
  ]},
  { title: "Internal", items: [
    { path: "/team/internal/email", icon: Inbox, label: "Email Inbox" },
    { path: "/team/internal/finance", icon: DollarSign, label: "Finance", ownerOnly: true },
    { path: "/team/sourcing", icon: Database, label: "Vendor DB" },
    { path: "/team/account", icon: UserIcon, label: "My Account" },
    { path: "/team/settings", icon: Settings, label: "Settings" },
  ]},
];

const TeamLayout = ({ children }: TeamLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const { role } = useUserRole();
  const isOwner = role === "owner";
  const [inboxCount, setInboxCount] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session) navigate("/team");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (!session) navigate("/team");
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const { count } = await supabase
        .from("prf_submissions")
        .select("*", { count: "exact", head: true })
        .in("status", ["new", "reviewing"]);
      if (!cancelled) setInboxCount(count || 0);
    };
    refresh();
    const t = setInterval(refresh, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [location.pathname]);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) toast.error("Error signing out");
    else { toast.success("Signed out"); navigate("/team"); }
  };

  if (!user) return null;

  return (
    <div className={`team-portal team-portal-bg min-h-screen flex ${collapsed ? "" : ""}`}>
      <aside
        className={`tp-sidebar sticky top-0 h-screen flex flex-col transition-[width] duration-200 shrink-0 ${collapsed ? "w-[64px]" : "w-[232px]"}`}
      >
        <div className="flex items-center gap-3 px-5 h-16 shrink-0 border-b border-[hsl(var(--tp-hairline))]">
          <img src={logo} alt="AB" className="w-7 h-7 shrink-0 rounded-md" />
          {!collapsed && (
            <div className="leading-tight">
              <p className="font-display text-[13px] font-semibold text-[hsl(var(--tp-text))]">Adventure Bakery</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--tp-text-dim))]">Team Portal</p>
            </div>
          )}
        </div>

        <ScrollArea className="flex-1 py-2">
          {navSections.map((section) => {
            const items = section.items.filter((i) => !i.ownerOnly || isOwner);
            if (items.length === 0) return null;
            return (
              <div key={section.title} className="mb-1">
                {!collapsed && <p className="tp-nav-section">{section.title}</p>}
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname === item.path ||
                    (item.path !== "/team/dashboard" && location.pathname.startsWith(item.path));
                  const showBadge = item.path === "/team/sales/inbox" && inboxCount > 0;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`tp-nav-item ${active ? "active" : ""}`}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                      {showBadge && (
                        <span className="ml-auto text-[10px] font-semibold bg-[hsl(var(--tp-gold))] text-black rounded-full px-1.5 min-w-[18px] text-center">
                          {inboxCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </ScrollArea>

        <div className="p-2 space-y-1 shrink-0 border-t border-[hsl(var(--tp-hairline))]">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="tp-nav-item w-[calc(100%-16px)] text-left"
          >
            {collapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            {!collapsed && <span>Collapse</span>}
          </button>
          <button onClick={handleSignOut} className="tp-nav-item w-[calc(100%-16px)] text-left">
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 px-6 lg:px-10 py-8">{children}</main>
      </div>

      <CoachChat progress={0} currentSection="Concept" />
    </div>
  );
};

export default TeamLayout;
