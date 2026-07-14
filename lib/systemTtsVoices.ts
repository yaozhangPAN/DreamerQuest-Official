function normalizeVoiceName(name: string): string {
  return name.toLowerCase().replace(/[\s_-]/g, '');
}

function isChineseVoice(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.toLowerCase().includes('zh');
}

function isGoogleMandarinVoice(voice: SpeechSynthesisVoice): boolean {
  if (!isChineseVoice(voice)) return false;
  const name = voice.name.toLowerCase();
  return (
    name.includes('google') &&
    (name.includes('普通话') ||
      name.includes('mandarin') ||
      name.includes('china') ||
      name.includes('中国'))
  );
}

function isTingTingVoice(voice: SpeechSynthesisVoice): boolean {
  if (!isChineseVoice(voice)) return false;
  return normalizeVoiceName(voice.name).includes('tingting');
}

function isMeijiaVoice(voice: SpeechSynthesisVoice): boolean {
  if (!isChineseVoice(voice)) return false;
  return normalizeVoiceName(voice.name).includes('meijia');
}

const CHINESE_VOICE_MATCHERS = [
  isGoogleMandarinVoice,
  isTingTingVoice,
  isMeijiaVoice,
] as const;

export function filterChineseSystemVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  const picked: SpeechSynthesisVoice[] = [];
  const seen = new Set<string>();

  for (const matcher of CHINESE_VOICE_MATCHERS) {
    const match = voices.find((voice) => matcher(voice) && !seen.has(voice.name));
    if (match) {
      seen.add(match.name);
      picked.push(match);
    }
  }

  return picked;
}

export function pickChineseSystemVoice(
  voices: SpeechSynthesisVoice[],
  preferredName?: string | null,
): SpeechSynthesisVoice | undefined {
  const allowed = filterChineseSystemVoices(voices);

  if (preferredName) {
    const preferred = allowed.find((voice) => voice.name === preferredName);
    if (preferred) return preferred;
  }

  if (allowed.length > 0) return allowed[0];

  for (const matcher of CHINESE_VOICE_MATCHERS) {
    const match = voices.find(matcher);
    if (match) return match;
  }

  return voices.find(isChineseVoice);
}

export function applyChineseSystemVoice(
  utterance: SpeechSynthesisUtterance,
  voices: SpeechSynthesisVoice[],
  preferredName?: string | null,
): void {
  const voice = pickChineseSystemVoice(voices, preferredName);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang;
    return;
  }

  utterance.lang = 'zh-CN';
}

export async function getSpeechVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();
  if (voices.length > 0) return voices;

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 1000);
    const handleVoices = () => {
      if (synth.getVoices().length > 0) {
        clearTimeout(timeout);
        synth.removeEventListener('voiceschanged', handleVoices);
        resolve();
      }
    };
    synth.addEventListener('voiceschanged', handleVoices);
    synth.getVoices();
  });

  return synth.getVoices();
}

const IGNORED_SPEECH_ERRORS = new Set(['canceled', 'interrupted']);

/**
 * Speak text with the browser SpeechSynthesis API.
 * Handles Chrome cancel races and ignores benign canceled/interrupted errors.
 */
export function speakTextWithSystemVoice(
  text: string,
  options: {
    preferredVoiceName?: string | null;
    rate?: number;
    onEnd?: () => void;
    onError?: (errorType: string) => void;
  } = {},
): void {
  const clean = text.trim();
  if (!clean) {
    options.onEnd?.();
    return;
  }

  const synth = window.speechSynthesis;
  const isChinese = /[\u4e00-\u9fa5]/.test(clean);
  const voices = synth.getVoices();
  const utterance = new SpeechSynthesisUtterance(clean);

  const userVoice = options.preferredVoiceName
    ? voices.find((v) => v.name === options.preferredVoiceName)
    : undefined;

  if (userVoice) {
    utterance.voice = userVoice;
    utterance.lang = userVoice.lang;
  } else if (isChinese) {
    applyChineseSystemVoice(utterance, voices, options.preferredVoiceName);
  } else {
    const english =
      voices.find((v) => v.name.includes('Samantha')) ||
      voices.find((v) => v.name.includes('Siri')) ||
      voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') || v.name.includes('Premium')),
      ) ||
      voices.find((v) => v.lang.startsWith('en') && v.name.includes('Google')) ||
      voices.find((v) => v.lang.startsWith('en'));
    if (english) {
      utterance.voice = english;
      utterance.lang = english.lang;
    } else {
      utterance.lang = 'en-US';
    }
  }

  utterance.rate = options.rate ?? (isChinese ? 0.9 : 0.8);
  utterance.pitch = 1;
  utterance.volume = 1;

  // Chrome can stall mid-utterance; nudge every few seconds while speaking.
  const chromeKeepAlive = window.setInterval(() => {
    if (!synth.speaking) {
      window.clearInterval(chromeKeepAlive);
      return;
    }
    try {
      synth.pause();
      synth.resume();
    } catch {
      /* ignore */
    }
  }, 8000);

  const finish = () => {
    window.clearInterval(chromeKeepAlive);
  };

  utterance.onend = () => {
    finish();
    options.onEnd?.();
  };

  utterance.onerror = (event) => {
    finish();
    const errorType = (event as SpeechSynthesisErrorEvent).error || 'unknown';
    if (IGNORED_SPEECH_ERRORS.has(errorType)) {
      options.onEnd?.();
      return;
    }
    options.onError?.(errorType);
    options.onEnd?.();
  };

  try {
    synth.cancel();
  } catch {
    /* ignore */
  }

  // Let cancel settle before speaking (avoids interrupted errors on some browsers).
  window.setTimeout(() => {
    try {
      synth.speak(utterance);
    } catch {
      finish();
      options.onError?.('speak-failed');
      options.onEnd?.();
    }
  }, 80);
}
