"""Speaker -> voice mapping. Deterministic hash -> pool index, so the same
character always gets the same voice within a session."""

import hashlib

ELEVENLABS_VOICE_POOL: list[str] = [
    "21m00Tcm4TlvDq8ikWAM",  # Rachel  - calm female
    "AZnzlk1XvdvUeBnXmlld",  # Domi    - strong female
    "EXAVITQu4vr4xnSDxMaL",  # Bella   - soft female
    "MF3mGyEYCl7XYWbV9V6O",  # Elli    - emotional female
    "ErXwobaYiN019PkySvjV",  # Antoni  - well-rounded male
    "TxGEqnHWrfWFTfGW9XjX",  # Josh    - deep male
    "VR6AewLTigWG4xSOukaG",  # Arnold  - crisp male
    "pNInz6obpgDQGcFmaJgB",  # Adam    - deep male
    "yoZ06aMxZJJ28mfd3POQ",  # Sam     - raspy male
]

# macOS `say -v ?` voices that ship with every recent macOS install
SAY_VOICE_POOL: list[str] = [
    "Samantha",
    "Alex",
    "Daniel",
    "Karen",
    "Moira",
    "Tessa",
    "Veena",
    "Fred",
    "Albert",
]


def _hash_index(speaker: str, pool_size: int) -> int:
    h = hashlib.sha1(speaker.encode("utf-8")).digest()
    return int.from_bytes(h[:4], "big") % pool_size


def pick_elevenlabs_voice(speaker: str | None, default: str) -> str:
    if not speaker:
        return default
    return ELEVENLABS_VOICE_POOL[_hash_index(speaker, len(ELEVENLABS_VOICE_POOL))]


def pick_say_voice(speaker: str | None) -> str | None:
    if not speaker:
        return None
    return SAY_VOICE_POOL[_hash_index(speaker, len(SAY_VOICE_POOL))]
