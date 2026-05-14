type ProgressMeterProps = {
  completed: number;
  total: number;
  label: string;
};

export function ProgressMeter({ completed, total, label }: ProgressMeterProps) {
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className="progress-meter">
      <div className="progress-copy">
        <span>{label}</span>
        <strong>{percent}%</strong>
      </div>
      <div className="progress-track" aria-label={`${label}: ${percent}% complete`}>
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
