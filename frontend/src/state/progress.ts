const progressKey = "cloud-katas-progress";

export type Progress = {
  completedModules: string[];
  completedExercises: Record<string, number[]>;
};

const emptyProgress: Progress = {
  completedModules: [],
  completedExercises: {},
};

export function loadProgress(): Progress {
  const stored = window.localStorage.getItem(progressKey);
  if (!stored) {
    return emptyProgress;
  }

  try {
    const parsed = JSON.parse(stored) as Progress;
    return {
      completedModules: parsed.completedModules ?? [],
      completedExercises: parsed.completedExercises ?? {},
    };
  } catch {
    return emptyProgress;
  }
}

export function saveProgress(progress: Progress) {
  window.localStorage.setItem(progressKey, JSON.stringify(progress));
}

export function resetProgress() {
  window.localStorage.removeItem(progressKey);
}
