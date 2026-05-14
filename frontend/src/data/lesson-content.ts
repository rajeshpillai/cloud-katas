const lessonUrls = import.meta.glob("../../../docs/lessons/**/*.md", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

const lessonUrlByPath = Object.fromEntries(
  Object.entries(lessonUrls).map(([path, url]) => {
    const normalizedPath = path.replace("../../../", "");
    return [normalizedPath, url];
  }),
) as Record<string, string>;

export async function loadLessonContent(path: string): Promise<string> {
  const url = lessonUrlByPath[path];
  if (!url) return "";
  const response = await fetch(url);
  if (!response.ok) return "";
  return response.text();
}
