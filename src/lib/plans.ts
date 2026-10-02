export type PlanId = "free" | "sprout" | "star" | "galaxy";

export type Plan = {
  id: PlanId;
  name: string;
  price: number; // USD, one-time for 30 days
  credits: number | null; // null = unlimited
  tagline: string;
  resolution: "720p" | "1080p";
  videosPerDay: number | null;
  remakesPerVideo: number | null; // null = unlimited, 0 = none
  applySuggestions: boolean;
  customIntro: boolean;
  vertical: boolean;
  maxScenes: number;
  priority: boolean;
  features: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free", name: "Free trial", price: 0, credits: 20, tagline: "Try it for 7 days",
    resolution: "720p", videosPerDay: 2, remakesPerVideo: 0, applySuggestions: false, customIntro: false,
    vertical: false, maxScenes: 6, priority: false,
    features: ["20 credits, refilled every 24 hours", "2 videos per day", "720p wide videos", "Default logo intro", "Free AI chat with Toonie", "Ends after 7 days"],
  },
  sprout: {
    id: "sprout", name: "Sprout", price: 9.99, credits: 300, tagline: "For new channels",
    resolution: "720p", videosPerDay: null, remakesPerVideo: 3, applySuggestions: true, customIntro: true,
    vertical: true, maxScenes: 10, priority: false,
    features: ["300 credits for 30 days", "Unlimited videos (within credits)", "Apply AI suggestions", "Re-make up to 3 scenes per video", "Tall Shorts videos", "Upload your own intro"],
  },
  star: {
    id: "star", name: "Star", price: 24.99, credits: 1000, tagline: "Most popular",
    resolution: "1080p", videosPerDay: null, remakesPerVideo: null, applySuggestions: true, customIntro: true,
    vertical: true, maxScenes: 10, priority: false,
    features: ["1,000 credits for 30 days", "Full HD 1080p clips", "Unlimited scene edits & re-makes", "Everything in Sprout"],
  },
  galaxy: {
    id: "galaxy", name: "Galaxy", price: 59.99, credits: null, tagline: "For busy creators",
    resolution: "1080p", videosPerDay: null, remakesPerVideo: null, applySuggestions: true, customIntro: true,
    vertical: true, maxScenes: 20, priority: true,
    features: ["Unlimited credits for 30 days", "Longer videos (up to 20 scenes)", "Priority video making", "Everything in Star"],
  },
};

export const PAID_PLANS = [PLANS.sprout, PLANS.star, PLANS.galaxy];

/** 1 credit per second of clip. */
export const creditCost = (seconds: number) => Math.max(1, Math.round(seconds));

export type MyPlan = {
  plan: PlanId;
  active: boolean;
  expiredReason: string | null;
  creditsLeft: number | null; // null = unlimited
  resetAt: string | null; // free: next refill
  periodEnd: string | null;
  trialEndsAt: string | null;
  videosToday: number;
};
