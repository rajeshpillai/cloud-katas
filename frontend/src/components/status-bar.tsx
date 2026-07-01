import { Github } from "lucide-react";

const REPO_URL = "https://github.com/rajeshpillai/cloud-katas";
const COMPANY = "Algorisys Technologies Pvt Ltd";

export function StatusBar() {
  const year = new Date().getFullYear();

  return (
    <footer className="status-bar" role="contentinfo">
      <div className="status-bar-left">
        <span className="status-copyright">
          © {year} {COMPANY}. All rights reserved.
        </span>
      </div>
      <div className="status-bar-right">
        <span className="status-meta" title={`Version ${__APP_VERSION__}, built ${__BUILD_DATE__}`}>
          <span className="status-version">v{__APP_VERSION__}</span>
          <span className="status-sep" aria-hidden="true">
            ·
          </span>
          <span className="status-date">{__BUILD_DATE__}</span>
        </span>
        <a className="status-bar-link" href={REPO_URL} target="_blank" rel="noreferrer noopener">
          <Github size={14} />
          <span>Source on GitHub</span>
        </a>
      </div>
    </footer>
  );
}
