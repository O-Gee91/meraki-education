import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-card">
      <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground">
        <span>Meraki Education Platform</span>
        <div className="flex flex-wrap gap-5">
          <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground">Terms</Link>
          <Link to="/auth" search={{}} className="hover:text-foreground">Sign in</Link>
        </div>
      </nav>
    </footer>
  );
}
