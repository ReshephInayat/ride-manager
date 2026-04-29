// Lightweight notification sound using the Web Audio API. No asset required.
// Plays a soft two-tone "ding" that's pleasant and quick.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) {
      const Ctor =
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
        (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    return ctx;
  } catch {
    return null;
  }
}

export function playNotificationSound() {
  const ac = getCtx();
  if (!ac) return;
  // Resume if user gesture suspended it
  if (ac.state === "suspended") ac.resume().catch(() => {});

  const now = ac.currentTime;
  const tone = (freq: number, start: number, dur = 0.18, peak = 0.18) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + start);
    gain.gain.linearRampToValueAtTime(peak, now + start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.02);
  };

  tone(880, 0);     // A5
  tone(1320, 0.12); // E6
}
