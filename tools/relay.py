#!/usr/bin/env python3
"""Relay: keeps crew work going when a worker hits a usage or rate limit.
Queue file (JSON list) holds tasks with a fallback chain of crew profiles. Each tick:
  running task whose run has ended -> read its last answer; a limit marker or no answer -> start the next worker in the
  chain with a 'continue from the branch state' note; a normal answer -> mark done (gates and review stay with Varro and Konrad).
  pending task -> start when fewer than CAP runs are active.
Never touches main, deploys or restarts. Usage: relay.py QUEUE.json [--dry]   |   relay.py --selftest"""
import json, os, re, subprocess, sys, time
CAP = int(os.environ.get("RELAY_CAP", "3"))
GRACE = 180  # seconds a fresh run may be missing from the runs list before it counts as ended
MARK = re.compile(r"rate.?limit|usage limit|limit reached|quota|too many requests|resets? in|try again later|overloaded", re.I)
API = f"http://127.0.0.1:{os.environ.get('CAESAR_PORT','4400')}/api/p/agents"
CREW = os.path.expanduser(os.environ.get("CREW_RUN", "~/caesar/tools/crew-run.sh"))

def sh(*a):
    return subprocess.run(["bash", CREW, *a], capture_output=True, text=True, timeout=60).stdout
def active():
    """Thread id prefixes (8 chars) of the runs that are alive. Matching by worker name was wrong: one busy worker
    made every other task of his look alive, and the cap stayed full forever (found 2026-11-22)."""
    out = sh("status")
    return [l.split()[-1][:8] for l in out.splitlines() if "thread" in l]
def last_answer(thread):
    return sh("read", thread).strip()
def start(agent, prompt):
    r = json.loads(sh(agent, prompt).strip().splitlines()[-1]); return r["runId"], r["threadId"]

def tick(q, now, io):
    """q: list of task dicts; io: dict of functions active/answer/start. Returns log lines. Pure enough to test."""
    log = []; act = io["active"]()
    for t in q:
        if t["status"] == "running":
            who = t["chain"][t["i"]]
            if t["thread"][:8] in act or now - t["startedAt"] < GRACE: continue
            ans = io["answer"](t["thread"])
            silent = not ans or ans == "(no answer yet)"
            limited = bool(MARK.search(ans[-1500:]))
            if silent and not t.get("retried"):  # run ended with no answer: one retry on the same worker before handing over
                t["retried"] = True; t["attempts"] += 1
                t["run"], t["thread"] = io["start"](who, t["prompt"] + "\n\nCONTINUE: your previous run ended without a report. Read the branch git log and files first, do not redo finished work, finish and report."); t["startedAt"] = now
                log.append(f"{t['id']}: {who} ended silent, retried once")
            elif silent or limited:
                if t["i"] + 1 < len(t["chain"]):
                    t["i"] += 1; t["attempts"] += 1; t["retried"] = False
                    note = f"\n\nCONTINUE: the previous worker ({who}) stopped (limit or no answer). Read the branch git log and files first, do not redo finished work, finish the task."
                    t["run"], t["thread"] = io["start"](t["chain"][t["i"]], t["prompt"] + note); t["startedAt"] = now
                    log.append(f"{t['id']}: {who} stopped, handed to {t['chain'][t['i']]}")
                else:
                    t["status"] = "blocked"; log.append(f"{t['id']}: chain exhausted, blocked (needs Primus)")
            else:
                t["status"] = "done"; log.append(f"{t['id']}: done by {who}")
    running = sum(1 for t in q if t["status"] == "running")
    for t in q:
        if t["status"] == "pending" and running < CAP and all(d["status"] == "done" for d in q if d["id"] in t.get("after", [])):
            t["run"], t["thread"] = io["start"](t["chain"][0], t["prompt"]); t.update(status="running", i=0, attempts=1, startedAt=now); running += 1
            log.append(f"{t['id']}: started on {t['chain'][0]}")
    return log

def selftest():
    calls = []
    q = [{"id": "a", "status": "running", "chain": ["x", "y"], "i": 0, "attempts": 1, "prompt": "P", "thread": "T1", "startedAt": 0},
         {"id": "b", "status": "pending", "chain": ["z"], "prompt": "Q", "after": ["a"]}]
    io = {"active": lambda: [], "answer": lambda th: "You have hit your usage limit, resets in 3h", "start": lambda ag, p: (calls.append(ag) or ("R", "T2"))}
    tick(q, 1000, io); assert q[0]["i"] == 1 and calls == ["y"] and q[1]["status"] == "pending"      # limit: handed over, dependent waits
    io["answer"] = lambda th: "Done. Files: a.ts. Gates green."; q[0]["startedAt"] = 0; tick(q, 2000, io)
    assert q[0]["status"] == "done" and calls == ["y", "z"] and q[1]["status"] == "running"            # normal: done, dependent starts
    q2 = [{"id": "c", "status": "running", "chain": ["x"], "i": 0, "attempts": 1, "prompt": "P", "thread": "T", "startedAt": 0}]
    io["answer"] = lambda th: ""; tick(q2, 1000, io); assert q2[0]["status"] == "running" and q2[0]["retried"]   # silent: one retry
    tick(q2, 3000, io); assert q2[0]["status"] == "blocked"                                            # still silent, chain exhausted
    q3 = [{"id": "d", "status": "running", "chain": ["x", "y"], "i": 0, "attempts": 1, "prompt": "P", "thread": "T", "startedAt": 900}]
    tick(q3, 1000, io); assert q3[0]["i"] == 0                                                         # fresh run inside grace: untouched
    q4 = [{"id": "e", "status": "running", "chain": ["w"], "i": 0, "attempts": 1, "prompt": "P", "thread": "AAAAAAAA-1", "startedAt": 0},
          {"id": "f", "status": "running", "chain": ["w"], "i": 0, "attempts": 1, "prompt": "P", "thread": "BBBBBBBB-2", "startedAt": 0}]
    io["active"] = lambda: ["BBBBBBBB"]; io["answer"] = lambda th: "Done."; tick(q4, 5000, io)
    assert q4[0]["status"] == "done" and q4[1]["status"] == "running"                                   # same worker: only the live thread stays running
    print("selftest ok")

if __name__ == "__main__":
    if "--selftest" in sys.argv: selftest(); sys.exit()
    path = sys.argv[1]
    if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(path)), "PAUSE")): print("paused (PAUSE file present)"); sys.exit()  # kill switch
    q = json.load(open(path))
    io = {"active": active, "answer": last_answer, "start": (lambda a, p: ("DRY", "DRY")) if "--dry" in sys.argv else start}
    for line in tick(q, time.time(), io): print(time.strftime("%H:%M"), line)
    if "--dry" not in sys.argv: json.dump(q, open(path, "w"), indent=1)  # dry run never writes the queue
