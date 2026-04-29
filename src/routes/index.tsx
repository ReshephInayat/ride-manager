import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Car, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // If already signed in as an admin, jump straight to dashboard.
  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/40 flex flex-col">
      <header className="px-4 sm:px-6 py-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-lg sm:text-xl font-bold tracking-tight">Puget Sound Limo</div>
          <div className="text-xs text-muted-foreground">Ride manager</div>
        </div>
      </header>

      <main className="flex-1 px-4 sm:px-6 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8 sm:mb-12 mt-4 sm:mt-8">
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight">Welcome</h1>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto text-sm sm:text-base">
              Choose how you'd like to sign in.
            </p>
          </div>

          <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 max-w-3xl mx-auto">
            <Card className="p-6 sm:p-8 flex flex-col items-start hover:shadow-xl transition-shadow border-2 hover:border-primary/40">
              <div className="h-12 w-12 rounded-xl bg-primary/10 grid place-items-center mb-4">
                <ShieldCheck className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold">Admin login</h2>
              <p className="text-sm text-muted-foreground mt-2 mb-6">
                Manage rides, drivers, routes, and invoices for both workspaces.
              </p>
              <Button asChild size="lg" className="w-full">
                <Link to="/login">
                  Sign in as admin <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </Card>

            <Card className="p-6 sm:p-8 flex flex-col items-start hover:shadow-xl transition-shadow border-2 hover:border-primary/40">
              <div className="h-12 w-12 rounded-xl bg-amber-500/10 grid place-items-center mb-4">
                <Car className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold">Driver login</h2>
              <p className="text-sm text-muted-foreground mt-2 mb-6">
                See the rides assigned to you and update their status.
              </p>
              <Button asChild size="lg" variant="outline" className="w-full">
                <Link to="/driver">
                  Sign in as driver <ArrowRight className="h-4 w-4 ml-2" />
                </Link>
              </Button>
            </Card>
          </div>
        </div>
      </main>

      <footer className="px-4 sm:px-6 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Puget Sound Limo
      </footer>
    </div>
  );
}
