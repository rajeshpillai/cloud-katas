import type { Module } from "../data/modules";
import { ModuleCard } from "./module-card";

type ModuleNavProps = {
  modules: Module[];
  activeSlug: string;
  completed: string[];
  isLocked: (module: Module) => boolean;
  onSelect: (slug: string) => void;
};

const sections = [
  { key: "gcp-sequence", label: "GCP Sequence", includes: (module: Module) => module.id <= 10 },
  { key: "aws-sequence", label: "AWS Sequence", includes: (module: Module) => module.id >= 11 },
];

export function ModuleNav({ modules, activeSlug, completed, isLocked, onSelect }: ModuleNavProps) {
  return (
    <nav className="module-nav" aria-label="Learning modules">
      {sections.map((section) => {
        const group = modules.filter(section.includes);
        if (group.length === 0) {
          return null;
        }

        return (
          <section key={section.key}>
            <h2>{section.label}</h2>
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
