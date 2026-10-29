"""Concatène des WAV 16 kHz mono en insérant 1,5 s de silence entre chaque (comme une pause entre intervenants)."""
import sys
import wave

out_path, *inputs = sys.argv[1:]
with wave.open(out_path, "wb") as out:
    out.setnchannels(1)
    out.setsampwidth(2)
    out.setframerate(16000)
    silence = b"\x00\x00" * int(16000 * 1.5)
    for i, path in enumerate(inputs):
        with wave.open(path, "rb") as w:
            assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2, path
            if i:
                out.writeframes(silence)
            out.writeframes(w.readframes(w.getnframes()))
    total = out.tell() / 16000
print(f"Audio de test : {total:.1f} s ({len(inputs)} passages)")
