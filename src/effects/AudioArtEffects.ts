export const EQUATOR_EFFECT_ID = 1000;

export const GLITCH_AUDIO_EFFECTS = [
  {
    id: 1001,
    name: "Packet Fault",
    description:
      "Bass shifts scrolling bands. Mids cut large gaps. High frequencies add pixel errors.",
  },
  {
    id: 1002,
    name: "Bit Rain",
    description:
      "Bass lights falling blocks. Mids extend trails. High frequencies break column edges.",
  },
  {
    id: 1003,
    name: "Spectral Gates",
    description:
      "Bass opens horizontal shutters. Mids open vertical gates. High frequencies interrupt the gates.",
  },
] as const;

export function isGlitchAudioEffect(id: number): boolean {
  return GLITCH_AUDIO_EFFECTS.some((effect) => effect.id === id);
}

export function isSimulatorAudioEffect(id: number): boolean {
  return id === EQUATOR_EFFECT_ID || isGlitchAudioEffect(id);
}

export function isGlitchAudioEffectName(name: string | undefined): boolean {
  return GLITCH_AUDIO_EFFECTS.some((effect) => effect.name === name);
}
