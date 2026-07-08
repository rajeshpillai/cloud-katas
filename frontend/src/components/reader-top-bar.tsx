import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";
import { Link } from "react-router-dom";

// Shared top bar for the sidebar-less reader pages (primers, tracks). It carries
// the Cloud Katas brand (linking home) so these pages read as part of the app,
// with page-specific actions (back, section index) passed in as children.
export function ReaderTopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="reader-topbar">
      <Link className="brand" to="/" aria-label="Cloud Katas home">
        <div className="brand-mark">
          <BookOpen size={22} />
        </div>
        <div className="sidebar-label">
          <span>Cloud Katas</span>
          <strong>GCP to AWS</strong>
        </div>
      </Link>
      <div className="reader-actions">{children}</div>
    </header>
  );
}
