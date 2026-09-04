#!/usr/bin/env python3
"""
backfill_courses.py — fetch par/handicap data for unmapped Rattle Golf courses.

WHAT THIS DOES
    Reads unmapped_courses.json (id + display name + region for each course that
    has no local hole data), queries GolfCourseAPI for each one, validates the
    result hard, and writes out ready-to-paste coursePresets entries.

WHAT THIS DOES NOT DO
    It does not touch course-data.js. It does not write to Firebase. It only
    reads from the API and writes two output files. Nothing in the repo changes
    until you paste the generated entries in yourself.

WHY THE VALIDATION IS STRICT
    Bad course data is worse than no course data. An unmapped course at least
    shows par 4s that a human might question. A course with a plausible-looking
    but wrong handicap index silently misallocates strokes and corrupts net
    scoring and settlement, and nobody notices. So every course either passes
    every check or goes in the review pile. There is no "close enough" tier.

COST
    Two requests per course: one search, one detail. 115 courses = 230 requests.
    Free tier is 50/day, so a full run takes ~5 days unless you upgrade.
    Every successful response is cached to disk, so re-running never re-spends
    a request on a course already fetched. Stop and resume freely.

USAGE
    export GOLFCOURSE_API_KEY=your_key_here
    python3 backfill_courses.py                # process whatever budget allows
    python3 backfill_courses.py --limit 20     # stop after 20 new courses
    python3 backfill_courses.py --only swwa_   # only ids starting with swwa_
    python3 backfill_courses.py --report       # re-emit outputs from cache, no API calls
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from difflib import SequenceMatcher

BASE_URL = "https://api.golfcourseapi.com/v1"
CACHE_FILE = "course_cache.json"
INPUT_FILE = "unmapped_courses.json"
OUT_PRESETS = "generated_presets.js"
OUT_REPORT = "backfill_report.txt"

# Seconds between API calls. Politeness, not a documented requirement.
REQUEST_DELAY = 1.0

# Below this name-similarity score a match is never auto-accepted.
NAME_MATCH_THRESHOLD = 0.55


# ---------------------------------------------------------------- http

def api_get(path, params, api_key):
    """GET against GolfCourseAPI. Returns parsed JSON or raises."""
    url = f"{BASE_URL}{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        "Authorization": f"Key {api_key}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:300]
        if e.code == 401:
            raise SystemExit("API key rejected (401). Check GOLFCOURSE_API_KEY.")
        if e.code == 429:
            raise RateLimited(f"Rate limited (429). {body}")
        raise RuntimeError(f"HTTP {e.code} for {path}: {body}")


class RateLimited(Exception):
    pass


# ---------------------------------------------------------------- matching

def normalize(name):
    """Strip the noise that stops a golf course name from matching itself."""
    n = name.lower()
    n = re.sub(r"\([^)]*\)", " ", n)          # drop parentheticals: "(Hood River)"
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    # Words that appear in nearly every course name and carry no signal.
    for filler in ("golf", "course", "club", "country", "the", "at", "links", "cc", "gc"):
        n = re.sub(rf"\b{filler}\b", " ", n)
    return " ".join(n.split())


def similarity(a, b):
    return SequenceMatcher(None, normalize(a), normalize(b)).ratio()


def pick_best_match(local_name, candidates):
    """
    Score every candidate against the local name and return (best, score, all_scored).
    Compares against club_name and course_name and keeps whichever scores higher,
    because the API splits those and a local name may match either one.
    """
    scored = []
    for c in candidates:
        club = c.get("club_name") or ""
        course = c.get("course_name") or ""
        s = max(similarity(local_name, club), similarity(local_name, course))
        scored.append((s, c))
    scored.sort(key=lambda t: t[0], reverse=True)
    if not scored:
        return None, 0.0, []
    return scored[0][1], scored[0][0], scored


# ---------------------------------------------------------------- tee selection

def collect_tee_sets(detail):
    """
    Flatten the API's nested tee structure into a list of candidate tee sets.

    The API nests three levels deep before reaching holes:
        tees -> "male"/"female" -> [tee box] -> holes[]
    We prefer male tee sets because that is what this app's groups play off,
    but fall back to whatever exists rather than dropping a course entirely.
    """
    tees = detail.get("tees") or {}
    out = []
    for gender in ("male", "female"):
        for tee in (tees.get(gender) or []):
            holes = tee.get("holes") or []
            if len(holes) == 18:
                out.append({
                    "gender": gender,
                    "tee_name": tee.get("tee_name") or "?",
                    "par_total": tee.get("par_total"),
                    "holes": holes,
                })
    # Male first, then by tee name for determinism across runs.
    out.sort(key=lambda t: (t["gender"] != "male", t["tee_name"]))
    return out


# ---------------------------------------------------------------- validation

def validate_holes(holes):
    """
    Return (ok, problems, data). data is the coursePresets-shaped array.

    Checks, in order of how badly a failure would corrupt scoring:
      - exactly 18 holes
      - every par present and in 3..6
      - par total in a believable range
      - handicap index is a true permutation of 1..18 (the critical one:
        duplicates or gaps mean stroke allocation is wrong for somebody)
    """
    problems = []

    if len(holes) != 18:
        return False, [f"expected 18 holes, got {len(holes)}"], None

    pars, idxs = [], []
    for i, h in enumerate(holes, start=1):
        p = h.get("par")
        x = h.get("handicap")
        if not isinstance(p, int) or not (3 <= p <= 6):
            problems.append(f"hole {i}: bad par {p!r}")
        if not isinstance(x, int) or not (1 <= x <= 18):
            problems.append(f"hole {i}: bad handicap index {x!r}")
        pars.append(p)
        idxs.append(x)

    if problems:
        return False, problems, None

    total = sum(pars)
    if not (66 <= total <= 76):
        problems.append(f"par total {total} outside believable range 66-76")

    if sorted(idxs) != list(range(1, 19)):
        dupes = sorted({v for v in idxs if idxs.count(v) > 1})
        missing = sorted(set(range(1, 19)) - set(idxs))
        problems.append(
            "handicap indexes are not a permutation of 1-18"
            + (f"; duplicated: {dupes}" if dupes else "")
            + (f"; missing: {missing}" if missing else "")
        )

    if problems:
        return False, problems, None

    data = [{"hole": i, "par": pars[i - 1], "hcpIndex": idxs[i - 1]} for i in range(1, 19)]
    return True, [], data


# ---------------------------------------------------------------- emit

def js_entry(course_id, display_name, data):
    """Render one coursePresets entry in the exact style of the existing file."""
    holes = ",".join(
        "{hole:%d,par:%d,hcpIndex:%d}" % (h["hole"], h["par"], h["hcpIndex"])
        for h in data
    )
    safe_name = display_name.replace("\\", "\\\\").replace('"', '\\"')
    return '        %s: { name: "%s", data: [%s] },' % (course_id, safe_name, holes)


# ---------------------------------------------------------------- cache

def load_json(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


def save_json(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=1)


# ---------------------------------------------------------------- main

def process_one(course, api_key, cache):
    """Fetch and validate a single course. Returns a result dict; caches raw detail."""
    cid, cname = course["id"], course["name"]
    result = {"id": cid, "name": cname, "region": course.get("region", "")}

    entry = cache.get(cid)
    if entry is None:
        search = api_get("/search", {"search_query": cname}, api_key)
        time.sleep(REQUEST_DELAY)
        candidates = search.get("courses") or []
        if not candidates:
            result["status"] = "no_search_results"
            cache[cid] = {"detail": None, "matched": None, "score": 0.0}
            return result

        best, score, scored = pick_best_match(cname, candidates)
        matched_label = f"{best.get('club_name','')} / {best.get('course_name','')}"

        if score < NAME_MATCH_THRESHOLD:
            result["status"] = "weak_match"
            result["matched"] = matched_label
            result["score"] = round(score, 2)
            result["alternatives"] = [
                f"{c.get('club_name','')} / {c.get('course_name','')} ({s:.2f})"
                for s, c in scored[:4]
            ]
            cache[cid] = {"detail": None, "matched": matched_label, "score": score}
            return result

        detail = api_get(f"/courses/{best['id']}", None, api_key)
        time.sleep(REQUEST_DELAY)
        cache[cid] = {"detail": detail, "matched": matched_label, "score": score}
        entry = cache[cid]

    if not entry.get("detail"):
        result["status"] = "no_detail_cached"
        result["matched"] = entry.get("matched")
        result["score"] = round(entry.get("score", 0.0), 2)
        return result

    detail = entry["detail"]
    result["matched"] = entry.get("matched")
    result["score"] = round(entry.get("score", 0.0), 2)
    result["api_location"] = (detail.get("location") or {}).get("address", "")

    tee_sets = collect_tee_sets(detail)
    if not tee_sets:
        result["status"] = "no_18_hole_tee_set"
        return result

    for tee in tee_sets:
        ok, problems, data = validate_holes(tee["holes"])
        if ok:
            result["status"] = "ok"
            result["tee"] = f"{tee['gender']} / {tee['tee_name']}"
            result["par_total"] = sum(h["par"] for h in data)
            result["data"] = data
            return result
        result.setdefault("rejected_tees", []).append(
            f"{tee['gender']}/{tee['tee_name']}: " + "; ".join(problems)
        )

    result["status"] = "failed_validation"
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None,
                    help="stop after this many courses that need new API calls")
    ap.add_argument("--only", default=None,
                    help="only process course ids starting with this prefix")
    ap.add_argument("--report", action="store_true",
                    help="regenerate outputs from cache only, make no API calls")
    args = ap.parse_args()

    api_key = os.environ.get("GOLFCOURSE_API_KEY", "").strip()
    if not api_key and not args.report:
        raise SystemExit(
            "Set your key first:\n    export GOLFCOURSE_API_KEY=your_key_here"
        )

    courses = load_json(INPUT_FILE, None)
    if courses is None:
        raise SystemExit(f"Missing {INPUT_FILE} — it should sit next to this script.")

    if args.only:
        courses = [c for c in courses if c["id"].startswith(args.only)]

    cache = load_json(CACHE_FILE, {})
    results = []
    new_calls = 0
    stopped_early = None

    for course in courses:
        needs_call = course["id"] not in cache
        if needs_call and args.report:
            continue
        if needs_call and args.limit is not None and new_calls >= args.limit:
            stopped_early = "hit --limit"
            break
        try:
            r = process_one(course, api_key, cache)
        except RateLimited as e:
            stopped_early = f"rate limited — {e}"
            break
        except Exception as e:
            r = {"id": course["id"], "name": course["name"], "status": "error", "error": str(e)}
        results.append(r)
        if needs_call:
            new_calls += 1
            save_json(CACHE_FILE, cache)   # save after every call; never lose a request
        print(f"  {r['status']:<20} {course['id']:<28} {course['name']}")

    save_json(CACHE_FILE, cache)

    ok = [r for r in results if r["status"] == "ok"]
    bad = [r for r in results if r["status"] != "ok"]

    with open(OUT_PRESETS, "w") as f:
        f.write("// Generated by backfill_courses.py — REVIEW BEFORE PASTING.\n")
        f.write("// Paste these inside the coursePresets object in course-data.js.\n")
        f.write(f"// {len(ok)} courses passed validation.\n\n")
        for r in sorted(ok, key=lambda r: r["id"]):
            f.write(f"        // {r['matched']}  [{r['tee']}, par {r['par_total']}, match {r['score']}]\n")
            f.write(js_entry(r["id"], r["name"], r["data"]) + "\n")

    with open(OUT_REPORT, "w") as f:
        f.write("BACKFILL REPORT\n")
        f.write("=" * 70 + "\n")
        f.write(f"processed:        {len(results)}\n")
        f.write(f"passed:           {len(ok)}\n")
        f.write(f"needs attention:  {len(bad)}\n")
        f.write(f"new API calls:    {new_calls} (~{new_calls * 2} requests)\n")
        f.write(f"cached total:     {len(cache)} / {len(courses)}\n")
        if stopped_early:
            f.write(f"stopped early:    {stopped_early}\n")
        f.write("\n")

        f.write("PASSED — verify a few of these against a real scorecard\n")
        f.write("-" * 70 + "\n")
        for r in sorted(ok, key=lambda r: r["score"]):
            f.write(f"[match {r['score']}] {r['id']}\n")
            f.write(f"    local:  {r['name']}\n")
            f.write(f"    api:    {r['matched']}\n")
            f.write(f"    tee:    {r['tee']}   par {r['par_total']}\n")
            if r.get("api_location"):
                f.write(f"    where:  {r['api_location']}\n")
        f.write("\n")

        f.write("NEEDS ATTENTION — nothing generated for these\n")
        f.write("-" * 70 + "\n")
        for r in sorted(bad, key=lambda r: r["status"]):
            f.write(f"[{r['status']}] {r['id']}  ({r['name']})\n")
            if r.get("matched"):
                f.write(f"    best guess: {r['matched']}  score {r.get('score')}\n")
            for alt in r.get("alternatives", []):
                f.write(f"    also saw:   {alt}\n")
            for rej in r.get("rejected_tees", []):
                f.write(f"    rejected:   {rej}\n")
            if r.get("error"):
                f.write(f"    error:      {r['error']}\n")

    print()
    print(f"passed {len(ok)} / {len(results)} processed   ({len(cache)}/{len(courses)} cached)")
    if stopped_early:
        print(f"stopped early: {stopped_early}")
    print(f"wrote {OUT_PRESETS} and {OUT_REPORT}")


if __name__ == "__main__":
    main()
