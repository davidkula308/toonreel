export type Scene = {
  id: string;
  title: string;
  start: number;
  end: number;
  visual: string;
  dialogue: string;
  onScreenText: string;
  status?: "idle" | "generating" | "done" | "failed";
  jobId?: string | null;
  clipPath?: string | null;
  error?: string | null;
  keyframePath?: string | null;
  remake?: boolean;
};

export type Suggestion = {
  id: string;
  title: string;
  detail: string;
  sceneId: string | null;
  instruction: string;
};

export const STYLES = [
  { id: "cartoon", label: "2D Cartoon", hint: "Bold outlines, flat bright colors, Saturday-morning feel" },
  { id: "3d", label: "3D Animation", hint: "Soft, glossy 3D characters like a family movie" },
  { id: "anime", label: "Anime", hint: "Big expressive eyes, painted skies, dynamic angles" },
  { id: "claymation", label: "Clay", hint: "Handmade clay figures with stop-motion charm" },
  { id: "storybook", label: "Storybook", hint: "Watercolor picture-book illustration" },
  { id: "pixel", label: "Pixel Art", hint: "Retro video-game pixels" },
] as const;

export const PALETTES = [
  { id: "sunny", label: "Sunny", colors: ["#FFB347", "#FFE066", "#7BDFF2", "#F25F5C"] },
  { id: "pastel", label: "Pastel", colors: ["#FFC8DD", "#BDE0FE", "#CDB4DB", "#C1F0C1"] },
  { id: "jungle", label: "Jungle", colors: ["#2D6A4F", "#95D5B2", "#FFD166", "#8B5E3C"] },
  { id: "space", label: "Cosmic", colors: ["#1B1F3B", "#3E5C9A", "#F7B801", "#F18701"] },
  { id: "candy", label: "Candy", colors: ["#FF5D8F", "#FFD6E0", "#97E6E6", "#FFF07C"] },
  { id: "ocean", label: "Ocean", colors: ["#03396C", "#00B4D8", "#90E0EF", "#FFE5B4"] },
] as const;
