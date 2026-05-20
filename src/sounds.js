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

function pickEnglishVoice() {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  return (
    voices.find((v) => v.lang.startsWith('en') && v.localService) ??
    voices.find((v) => v.lang.startsWith('en'))
  );
}

function speak(text, onError) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1.15;
  utterance.volume = 1;

  const english = pickEnglishVoice();
  if (english) utterance.voice = english;

  utterance.onerror = onError;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function playTone(notes) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
  resume.then(() => {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);

    for (const { frequency, start, duration } of notes) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, start);
      osc.connect(gain);
      osc.start(start);
      osc.stop(start + duration);
    }
  });
}

function playOopsTone() {
  const now = 0;
  playTone([
    { frequency: 523.25, start: now, duration: 0.12 },
    { frequency: 392, start: now + 0.1, duration: 0.2 },
    { frequency: 311.13, start: now + 0.22, duration: 0.22 },
  ]);
}

function playWelcomeTone() {
  const now = 0;
  playTone([
    { frequency: 392, start: now, duration: 0.12 },
    { frequency: 523.25, start: now + 0.1, duration: 0.14 },
    { frequency: 659.25, start: now + 0.22, duration: 0.22 },
  ]);
}

export function playOops() {
  if (typeof window === 'undefined') return;

  try {
    speak('Oops', playOopsTone);
  } catch {
    playOopsTone();
  }
}

export function playWelcome(name) {
  if (typeof window === 'undefined') return;

  const message = name ? `Welcome, ${name}` : 'Welcome';

  try {
    speak(message, playWelcomeTone);
  } catch {
    playWelcomeTone();
  }
}
