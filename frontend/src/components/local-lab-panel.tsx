import { useState } from "react";
import { ChevronDown, ChevronUp, TerminalSquare } from "lucide-react";
import type { LocalLab } from "../data/modules";

const levelLabel: Record<LocalLab["level"], string> = {
  full: "Runs locally",
  partial: "Partly local",
  none: "Concept only",
};

/**
 * Pill shown next to the module title summarizing how runnable its lab is on
 * the local floci stack. Renders nothing for "none".
 */
export function LocalLabBadge({ localLab }: { localLab: LocalLab }) {
  if (localLab.level === "none") {
    return null;
  }
  return (
    <span className={`local-lab-badge ${localLab.level}`}>
      <TerminalSquare size={13} aria-hidden="true" />
      {levelLabel[localLab.level]} · floci
    </span>
  );
}

/**
 * Collapsible setup panel for running a module's lab locally with the floci
 * emulators + kind (see labs/).
 */
export function LocalLabPanel({ localLab }: { localLab: LocalLab }) {
  const [open, setOpen] = useState(false);

  if (localLab.level === "none") {
    return null;
  }

  return (
    <section className="local-lab-panel">
      <div className="local-lab-header">
        <div className="local-lab-title">
          <span>Local Lab</span>
          <h2>Run this lab locally with floci</h2>
        </div>
        <div className="local-lab-actions">
          <LocalLabBadge localLab={localLab} />
          <button
            type="button"
            className="local-lab-toggle"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            {open ? "Hide setup" : "Show setup"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="local-lab-body">
          <div className="local-lab-meta">
            <div>
              <span className="local-lab-meta-label">Stack</span>
              <div className="chip-cloud">
                {localLab.stack.length === 0 ? (
                  <span>none</span>
                ) : (
                  localLab.stack.map((item) => <span key={item}>{item}</span>)
                )}
              </div>
            </div>
            {localLab.services && localLab.services.length > 0 ? (
              <div>
                <span className="local-lab-meta-label">Emulated services</span>
                <div className="chip-cloud">
                  {localLab.services.map((service) => (
                    <span key={service}>{service}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <p className="local-lab-step">Start the local environment from the repo root, then follow this lesson's "Run locally with floci" block:</p>
          <pre className="local-lab-code">
            <code>{"./labs/lab.sh up\nsource labs/env.sh"}</code>
          </pre>

          {localLab.caveat ? (
            <p className="local-lab-caveat">
              <strong>Not fully emulated:</strong> {localLab.caveat}
            </p>
          ) : null}

          <p className="muted local-lab-docs">
            See <code>labs/README.md</code> for prerequisites and the full per-module coverage table.
          </p>
        </div>
      ) : null}
    </section>
  );
}
