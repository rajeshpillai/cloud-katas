import { useEffect } from "react";
import { Github } from "lucide-react";
import { hardReload, onAppMounted } from "../lib/reload";

const REPO_URL = "https://github.com/rajeshpillai/cloud-katas";
const COMPANY = "Algorisys Technologies Pvt Ltd";

export function StatusBar() {
  const year = new Date().getFullYear();

  // The app has mounted: strip any cache-bust param and clear the reload guard.
  useEffect(() => {
    onAppMounted();
  }, []);

  return (
    <footer className="status-bar" role="contentinfo">
      <div className="status-bar-left">
        <span className="status-copyright">
          © {year} {COMPANY}. All rights reserved.
        </span>
      </div>
      <div className="status-bar-right">
        <span className="status-meta" title={`Version ${__APP_VERSION__}, built ${__BUILD_DATE__}`}>
          <button
            type="button"
            className="status-version"
            onClick={hardReload}
            title="Hard reload — fetch the latest deployed build (bypass cache)"
          >
            v{__APP_VERSION__}
          </button>
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
