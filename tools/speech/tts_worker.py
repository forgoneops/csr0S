#!/usr/bin/env python3
"""A warm Piper voice: loaded once, requests as JSON lines on stdin, answers as JSON lines on stdout. Local only.
  data/speech/tts/venv/bin/python tools/speech/tts_worker.py <voice.onnx> [--speed 1.0]
Request:  {"id": "1", "text": "One sentence."}
Answer:   {"id": "1", "ok": true, "wav": "<base64 WAV>", "took_s": 0.4}   or   {"id": "1", "ok": false, "error": "..."}
First line out is {"ready": true, "voice": "<file>", "load_s": 1.2}."""
import base64, io, json, sys, time, wave

def say(o):
    sys.stdout.write(json.dumps(o) + "\n"); sys.stdout.flush()

def main():
    from piper import PiperVoice, SynthesisConfig
    path = sys.argv[1]; speed = float(sys.argv[sys.argv.index("--speed") + 1]) if "--speed" in sys.argv else 1.0
    t = time.time(); voice = PiperVoice.load(path)
    cfg = SynthesisConfig(length_scale=1.0 / speed)
    say({"ready": True, "voice": path.rsplit("/", 1)[-1], "load_s": round(time.time() - t, 2)})
    for line in sys.stdin:
        r = {}
        try:
            r = json.loads(line); t = time.time(); buf = io.BytesIO()
            with wave.open(buf, "wb") as w:
                voice.synthesize_wav(str(r["text"])[:600], w, cfg)
            say({"id": r.get("id"), "ok": True, "wav": base64.b64encode(buf.getvalue()).decode(), "took_s": round(time.time() - t, 2)})
        except Exception as e:
            say({"id": r.get("id") if isinstance(r, dict) else None, "ok": False, "error": str(e)[:200]})

if __name__ == "__main__":
    main()
