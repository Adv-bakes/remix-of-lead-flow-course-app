import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, UserPlus, Search, Building2, ArrowRight } from "lucide-react";

interface ClientRow {
  user_id: string;
  business_name: string | null;
  access_granted: boolean;
  created_at: string | null;
}

export default function AdminDashboard() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    // Get all user_roles with role = 'user', then join profiles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "user");

    if (!roles || roles.length === 0) {
      setLoading(false);
      return;
    }

    const userIds = roles.map((r) => r.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, business_name, access_granted, created_at")
      .in("id", userIds);

    if (profiles) {
      setClients(
        profiles.map((p) => ({
          user_id: p.id,
          business_name: p.business_name,
          access_granted: p.access_granted,
          created_at: p.created_at,
        }))
      );
    }
    setLoading(false);
  };

  const filtered = clients.filter((c) =>
    (c.business_name || "").toLowerCase().includes(search.toLowerCase()) ||
    c.user_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-accent flex items-center gap-2">
            <Users className="h-7 w-7 text-accent" />
            Customer Management
          </h1>
          <p className="text-muted-foreground mt-1">
            {clients.length} client{clients.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/team/admin">
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Client
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/team/client/new">
              <Users className="h-4 w-4 mr-2" />
              Add Client
            </Link>
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No clients found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((client) => (
            <Link key={client.user_id} to={`/team/client/${client.user_id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-accent" />
                    {client.business_name || "No business name"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <Badge variant={client.access_granted ? "default" : "secondary"}>
                    {client.access_granted ? "Active" : "Pending"}
                  </Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
