# Beat times and a 0..1 loudness envelope (one value per 0.1 s) of a track, for scene_cinemagraph.py.
# usage: uv run --with librosa --with numpy python -I audio_env.py <track.wav> <out.json>
import sys, json, numpy as np, librosa
y, sr = librosa.load(sys.argv[1], sr=22050, mono=True)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
hop = 2205                                         # 0.1 s
rms = librosa.feature.rms(y=y, hop_length=hop)[0]
on = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
env = .6 * rms / max(rms.max(), 1e-6) + .4 * on[:len(rms)] / max(on.max(), 1e-6)
env = np.convolve(env, np.ones(3) / 3, "same")
json.dump({"tempo": float(np.atleast_1d(tempo)[0]), "beats": [float(b) for b in beats], "env": [float(v) for v in env]}, open(sys.argv[2], "w"))
print("tempo", float(np.atleast_1d(tempo)[0]), "beats", len(beats), "env", len(env))
