import { CheckCircle2, Circle, LockKeyhole } from "lucide-react";
import type { Module } from "../data/modules";

type ModuleCardProps = {
  module: Module;
  complete: boolean;
  locked: boolean;
  active: boolean;
  onSelect: (slug: string) => void;
};

export function ModuleCard({ module, complete, locked, active, onSelect }: ModuleCardProps) {
  return (
    <button className={`module-card ${active ? "active" : ""}`} type="button" onClick={() => onSelect(module.slug)}>
      <span className={`provider-pill ${module.provider}`}>{module.provider}</span>
      <span className="module-status" aria-hidden="true">
        {locked ? <LockKeyhole size={18} /> : complete ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </span>
      <span className="module-index">Module {module.id}</span>
      <strong>{module.title}</strong>
      <span>{module.objectives[0]}</span>
    </button>
  );
}
