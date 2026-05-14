import type { Module, Provider } from "../data/modules";
import { ModuleCard } from "./module-card";

type ModuleNavProps = {
  modules: Module[];
  activeSlug: string;
  completed: string[];
  isLocked: (module: Module) => boolean;
  onSelect: (slug: string) => void;
};

const labels: Record<Provider, string> = {
  gcp: "Google Cloud",
  shared: "Shared Foundations",
  aws: "Amazon Web Services",
};

export function ModuleNav({ modules, activeSlug, completed, isLocked, onSelect }: ModuleNavProps) {
  return (
    <nav className="module-nav" aria-label="Learning modules">
      {(["gcp", "shared", "aws"] as Provider[]).map((provider) => {
        const group = modules.filter((module) => module.provider === provider);
        return (
          <section key={provider}>
            <h2>{labels[provider]}</h2>
            <div className="module-stack">
              {group.map((module) => (
                <ModuleCard
                  key={module.slug}
                  module={module}
                  complete={completed.includes(module.slug)}
                  locked={isLocked(module)}
                  active={activeSlug === module.slug}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </section>
        );
      })}
    </nav>
  );
}
