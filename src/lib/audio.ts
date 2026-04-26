function playTone(frequency: number, durationMs: number): void {
  const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.value = 0.04;

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();

  window.setTimeout(() => {
    oscillator.stop();
    ctx.close().catch(() => undefined);
  }, durationMs);
}

export function playSuccessTone(): void {
  playTone(880, 80);
}

export function playErrorTone(): void {
  playTone(220, 150);
}
