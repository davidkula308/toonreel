import { useEffect } from "react";

export function playPop() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(900, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.6, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    /* audio unavailable */
  }
}

function shout(name: string) {
  if (!name || typeof speechSynthesis === "undefined") return;
  const u = new SpeechSynthesisUtterance(name + "!");
  u.rate = 1.05;
  u.pitch = 1.4;
  u.volume = 1;
  speechSynthesis.speak(u);
}

/** Default channel intro: logo pops in, zooms in/out, channel name shouted with a pop sound. */
export function ChannelIntro({
  logoUrl,
  channelName,
  customUrl,
  customIsVideo,
  seconds,
  onDone,
}: {
  logoUrl: string | null;
  channelName: string;
  customUrl?: string | null;
  customIsVideo?: boolean;
  seconds: number;
  onDone: () => void;
}) {
  const ms = Math.max(1, seconds) * 1000;
  useEffect(() => {
    let t2: ReturnType<typeof setTimeout> | undefined;
    if (!customUrl) {
      playPop();
      t2 = setTimeout(() => {
        playPop();
        shout(channelName);
      }, ms * 0.35);
    }
    const t = setTimeout(onDone, ms);
    return () => {
      clearTimeout(t);
      if (t2) clearTimeout(t2);
    };
  }, [ms, channelName, customUrl, onDone]);

  if (customUrl) {
    return customIsVideo ? (
      <video src={customUrl} autoPlay className="h-full w-full object-contain" />
    ) : (
      <img src={customUrl} alt="Channel intro" className="h-full w-full object-contain" />
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-sun" style={{ ["--intro-ms" as string]: `${ms}ms` }}>
      {logoUrl ? (
        <img src={logoUrl} alt="Channel logo" className="animate-intro-pop h-2/5 w-auto rounded-3xl object-contain" />
      ) : (
        <div className="animate-intro-pop flex h-32 w-32 items-center justify-center rounded-full border-4 border-ink bg-primary font-display text-5xl text-primary-foreground">
          {(channelName || "★").slice(0, 1)}
        </div>
      )}
      <div className="animate-intro-text font-display text-4xl font-bold text-ink md:text-6xl">{channelName || "Your Channel"}</div>
    </div>
  );
}
