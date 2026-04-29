import { Outlet, createRootRoute, HeadContent, Scripts, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { SystemProvider } from "@/lib/system";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Puget Sound Limo — Ride Manager" },
      { name: "description", content: "Manage daily pickup & dropoff rides and invoices." },
      { property: "og:title", content: "Puget Sound Limo — Ride Manager" },
      { property: "og:description", content: "Manage daily pickup & dropoff rides and invoices." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Puget Sound Limo — Ride Manager" },
      { name: "twitter:description", content: "Manage daily pickup & dropoff rides and invoices." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/225a6823-ac2c-46cd-a10c-aa4ff0643ce1" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/225a6823-ac2c-46cd-a10c-aa4ff0643ce1" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <ThemeProvider>
      <SystemProvider>
        <AuthProvider>
          <Outlet />
          {mounted && <Toaster richColors position="top-right" />}
        </AuthProvider>
      </SystemProvider>
    </ThemeProvider>
  );
}
