// Mirror of the backend voice pool (backend/app/services/voices.py).
// If you add/remove voices here, update the backend too.

export interface Voice {
  id: string;
  label: string;
}

// Sentinel value stored in voiceOverrides when the user picks "Mute" for a
// character. The content script skips rendering cues whose voice resolves to
// this value.
export const MUTE_VOICE_ID = "__anime_dub_mute__";

export const ELEVENLABS_VOICES: Voice[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel · calm female" },
  { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi · strong female" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella · soft female" },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli · emotional female" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni · well-rounded male" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh · deep male" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold · crisp male" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam · deep male" },
  { id: "yoZ06aMxZJJ28mfd3POQ", label: "Sam · raspy male" },
];

export const SAY_VOICES: Voice[] = [
  { id: "Samantha", label: "Samantha · female" },
  { id: "Alex", label: "Alex · male" },
  { id: "Daniel", label: "Daniel · UK male" },
  { id: "Karen", label: "Karen · AU female" },
  { id: "Moira", label: "Moira · IE female" },
  { id: "Tessa", label: "Tessa · ZA female" },
  { id: "Veena", label: "Veena · IN female" },
  { id: "Fred", label: "Fred · male" },
  { id: "Albert", label: "Albert · male" },
];
