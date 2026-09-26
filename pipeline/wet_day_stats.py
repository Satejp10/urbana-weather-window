"""Wet-day and hourly statistics used to design the rain and thermometer logic (computed in chat, 2026-09-26).

Not yet folded into data/urbana_climate.json -- see HANDOFF.md. Reads only data/raw/.

  python3 pipeline/wet_day_stats.py monthly
  python3 pipeline/wet_day_stats.py date 06-10 --hour 17

Definitions
- wet day: precipitation >= 0.01 in at CHAMPAIGN 3S (ACIS), 1991-2020 unless noted
- date window: the date +/- 7 days, pooled over years
- clouds: NASA POWER daily CLOUD_AMT 2001-2025, split by the same station's wet/dry flag
- hourly temperature: KCMI FM-15 report at HH-1:53 local time (America/Chicago), 2006-2025
"""
import argparse, csv, glob, json, pathlib, statistics as st, datetime as dt
from collections import defaultdict
from zoneinfo import ZoneInfo

RAW = pathlib.Path(__file__).resolve().parent.parent / "data" / "raw"
CHI, UTC = ZoneInfo("America/Chicago"), ZoneInfo("UTC")


def num(x):
    if x in ("M", "", None): return None
    if x == "T": return 0.001
    try: return float(x)
    except ValueError: return None


def acis():
    rows = json.load(open(RAW / "acis_por.json"))["data"]      # [date, maxT, minT, precip, snow, snow depth]
    return {r[0]: dict(hi=num(r[1]), lo=num(r[2]), p=num(r[3]), sn=num(r[4])) for r in rows}


def monthly(rec):
    M = defaultdict(lambda: dict(n=0, wet=0, w50=0, snow=0, ww=0, wtot=0, dw=0, dtot=0))
    for y in range(1991, 2021):
        prev, day = None, dt.date(y, 1, 1)
        while day.year == y:
            r = rec.get(day.isoformat())
            if not r or r["p"] is None: prev = None
            else:
                m, wet = M[day.month], r["p"] >= 0.01
                m["n"] += 1; m["wet"] += wet; m["w50"] += r["p"] >= 0.5
                m["snow"] += wet and (r["sn"] or 0) >= 0.1
                if prev is not None:
                    if prev: m["wtot"] += 1; m["ww"] += wet
                    else: m["dtot"] += 1; m["dw"] += wet
                prev = wet
            day += dt.timedelta(days=1)
    print("month  wet days/mo  % of days  >=0.5in days/mo  snow share of wet  P(wet|wet)  P(wet|dry)")
    for mo in range(1, 13):
        m = M[mo]
        print(f"{mo:>5}  {m['wet']/30:>11.1f}  {100*m['wet']/m['n']:>9.0f}  {m['w50']/30:>15.1f}  {100*m['snow']/max(1,m['wet']):>17.0f}"
              f"  {100*m['ww']/m['wtot']:>10.0f}  {100*m['dw']/m['dtot']:>10.0f}")


def window(month, day, years, k=7):
    for y in years:
        c = dt.date(y, month, day)
        for i in range(-k, k + 1): yield c + dt.timedelta(days=i)


def for_date(rec, month, day, hour=None):
    wetP, hi, lo = [], {True: [], False: []}, {True: [], False: []}
    for d in window(month, day, range(1991, 2021)):
        r = rec.get(d.isoformat())
        if not r or r["p"] is None or r["hi"] is None: continue
        wet = r["p"] >= 0.01
        hi[wet].append(r["hi"])
        if r["lo"] is not None: lo[wet].append(r["lo"])
        if wet: wetP.append(r["p"])
    n = len(hi[True]) + len(hi[False])
    print(f"{month:02d}-{day:02d} +/-7d, 1991-2020: wet {100*len(hi[True])/n:.0f}% of {n} days")
    print(f"  wet-day precip median {st.median(wetP):.2f} in, mean {st.mean(wetP):.2f}, p75 {sorted(wetP)[int(.75*len(wetP))]:.2f}")
    print(f"  mean high wet/dry {st.mean(hi[True]):.1f} / {st.mean(hi[False]):.1f} F; mean low wet/dry {st.mean(lo[True]):.1f} / {st.mean(lo[False]):.1f} F")
    cloud = json.load(open(RAW / "power.json"))["properties"]["parameter"]["CLOUD_AMT"]
    cw = {True: [], False: []}
    for d in window(month, day, range(2001, 2026)):
        r, c = rec.get(d.isoformat()), cloud.get(d.strftime("%Y%m%d"))
        if r and r["p"] is not None and c is not None and c >= 0: cw[r["p"] >= 0.01].append(c)
    print(f"  cloud cover wet/dry (POWER 2001-2025): {st.mean(cw[True]):.0f}% / {st.mean(cw[False]):.0f}%")
    if hour is None: return
    days = set(window(month, day, range(2006, 2026)))
    temps = {}
    for f in sorted(glob.glob(str(RAW / "isd" / "*.csv"))):
        for r in csv.DictReader(open(f)):
            if r.get("REPORT_TYPE", "").strip() != "FM-15": continue
            t = dt.datetime.fromisoformat(r["DATE"]).replace(tzinfo=UTC).astimezone(CHI)
            if t.hour != (hour - 1) % 24 or t.minute < 45 or t.date() not in days: continue
            v, q = (r["TMP"].split(",") + [""])[:2]
            if v in ("+9999", "") or q not in ("0", "1", "4", "5", "9", "A", "C", "I", "M", "P", "R", "U"): continue
            temps[t.date()] = int(v) / 10 * 9 / 5 + 32
    split = {True: [], False: []}
    for d, f in temps.items():
        r = rec.get(d.isoformat())
        if r and r["p"] is not None: split[r["p"] >= 0.01].append(f)
    print(f"  temp at {hour-1:02d}:53 local (KCMI 2006-2025): all {st.mean(temps.values()):.1f} F, wet {st.mean(split[True]):.1f}, dry {st.mean(split[False]):.1f} (n={len(temps)})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["monthly", "date"])
    ap.add_argument("mmdd", nargs="?")
    ap.add_argument("--hour", type=int)
    a = ap.parse_args()
    rec = acis()
    if a.mode == "monthly": monthly(rec)
    else:
        mo, dy = map(int, a.mmdd.split("-")); for_date(rec, mo, dy, a.hour)
