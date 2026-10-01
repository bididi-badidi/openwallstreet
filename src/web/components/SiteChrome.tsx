import type { ReactNode } from "react";
export function Arrow({ back = false }: { back?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      style={back ? { transform: "rotate(180deg)" } : undefined}
    >
      <path d="M4 12h15M13 5l7 7-7 7" />
    </svg>
  );
}
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className="site-shell">
      <header className="site-header">
        <a href="/" className="site-brand" aria-label="OpenWallstreet home">
          OpenWallstreet<span>.</span>
        </a>
        <a href="/" className="home-link">
          Home <Arrow />
        </a>
      </header>
      {children}
      <footer className="site-footer">
        <a href="/" className="footer-brand">
          OpenWallstreet<span>.</span>
        </a>
        <a href="mailto:contact@zishenchan.com">contact@zishenchan.com</a>
      </footer>
    </div>
  );
}
