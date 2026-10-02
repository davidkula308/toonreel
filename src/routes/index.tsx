import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ToonReel — Turn scripts into cartoon videos" },
      { name: "description", content: "Paste a script, pick a cartoon style and colors, and get AI-made animated scenes with a channel intro." },
      { property: "og:title", content: "ToonReel — Turn scripts into cartoon videos" },
      { property: "og:description", content: "AI cartoon video studio for kids' channels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const steps = [
  { n: "1", t: "Describe & paste", d: "Any script format — timestamps, notes, or a story idea." },
  { n: "2", t: "Pick a look", d: "Cartoon, 3D, anime, clay… plus a color palette." },
  { n: "3", t: "Make the scenes", d: "AI animates each scene with voices and sound." },
  { n: "4", t: "Polish", d: "Apply AI suggestions, then play with your channel intro." },
];

function Index() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-2xl font-bold">Toon<span className="text-primary">Reel</span></span>
        <Button asChild variant="outline" className="rounded-full border-2 border-ink">
          <Link to={user ? "/studio" : "/auth"}>{user ? "Open studio" : "Sign in"}</Link>
        </Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24">
        <section className="grid items-center gap-10 py-12 md:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="mb-4 inline-block rounded-full bg-secondary px-4 py-1 text-sm font-semibold text-secondary-foreground">For kids' channels & storytellers</p>
            <h1 className="text-5xl font-bold leading-tight md:text-7xl">
              Your script.<br />Their new <span className="text-primary">favorite</span> cartoon.
            </h1>
            <p className="mt-6 max-w-lg text-lg text-muted-foreground">
              Write Benny the Bunny's next adventure, pick how he looks, and ToonReel turns it into animated scenes — intro pop included.
            </p>
            <Button asChild size="lg" className="mt-8 rounded-full border-2 border-ink px-8 text-lg shadow-pop-sm">
              <Link to={user ? "/studio" : "/auth"}>Start a video</Link>
            </Button>
          </div>
          <div className="card-pop relative aspect-video overflow-hidden bg-sun p-6">
            <div className="flex h-full flex-col items-center justify-center gap-3" style={{ ["--intro-ms" as string]: "4000ms" }}>
              <div className="animate-intro-pop flex h-24 w-24 items-center justify-center rounded-full border-4 border-ink bg-primary font-display text-4xl text-primary-foreground [animation-iteration-count:infinite]">🐰</div>
              <div className="animate-intro-text font-display text-3xl font-bold text-ink [animation-iteration-count:infinite]">Benny's Tiny Adventures</div>
            </div>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="card-pop p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-accent font-display font-bold text-accent-foreground">{s.n}</div>
              <h3 className="text-lg font-semibold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
