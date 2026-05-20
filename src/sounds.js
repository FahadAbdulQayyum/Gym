let audioContext = null;

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener(
    'voiceschanged',
    () => window.speechSynthesis.getVoices(),
    { once: true }
  );
}

function getAudioContext() {
  if (!audioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioContext = new Ctx();
  }
  return audioContext;
}

function playOopsTone() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
  resume.then(() => {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

    const playNote = (frequency, start, duration) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, start);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + duration);
    };

    playNote(523.25, now, 0.12);
    playNote(392, now + 0.1, 0.2);
    playNote(311.13, now + 0.22, 0.22);
  });
}

export function playOops() {
  if (typeof window === 'undefined') return;

  try {
    const voices = window.speechSynthesis?.getVoices?.() ?? [];
    const utterance = new SpeechSynthesisUtterance('Oops');
    utterance.rate = 1.05;
    utterance.pitch = 1.15;
    utterance.volume = 1;

    const english =
      voices.find((v) => v.lang.startsWith('en') && v.localService) ??
      voices.find((v) => v.lang.startsWith('en'));
    if (english) utterance.voice = english;

    utterance.onerror = () => playOopsTone();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {
    playOopsTone();
  }
}
