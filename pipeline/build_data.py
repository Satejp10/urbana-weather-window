"""Build a per-day climate dataset for Urbana, IL (366 days, leap-year index).

Sources
- NOAA NCEI 1991-2020 daily + monthly normals, station USC00118740 (Champaign 3S,
  the long-running Champaign-Urbana record).
- ACIS daily data for the same station, 1888-08-17 .. latest -> records, percentiles,
  freeze/snow dates.
- NOAA ISD hourly obs, Willard Airport KCMI (725315-94870), 2006-01 .. 2025-08
  -> wind speed/direction, gusts, dew point.
- NASA POWER daily CLOUD_AMT (CERES SYN1deg), 2001-2025 -> cloud cover.
"""
import csv, json, glob, math, collections, datetime as dt, pathlib
from zoneinfo import ZoneInfo
import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "urbana_climate.json"
N = 366
LEAP = 2000
W = 7  # +/- days pooled for derived climatologies
UTC, CHI = dt.timezone.utc, ZoneInfo("America/Chicago")


def idx_of(m, d):
    return (dt.date(LEAP, m, d) - dt.date(LEAP, 1, 1)).days


def md_of(i):
    x = dt.date(LEAP, 1, 1) + dt.timedelta(days=int(i))
    return x.month, x.day


def md_str(i):
    m, d = md_of(i)
    return f"{m:02d}-{d:02d}"


def window(i, w=W):
    return [((i + k) % N) for k in range(-w, w + 1)]


def smooth(arr, w=3):
    a = np.array(arr, dtype=float)
    out = np.zeros(N)
    for i in range(N):
        out[i] = np.nanmean([a[j] for j in window(i, w)])
    return out


def r1(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else round(float(x), 1)


def r0(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else int(round(float(x)))


# ---------------------------------------------------------------- NOAA normals
def nval(s):
    s = (s or "").strip()
    if s == "":
        return None
    v = float(s)
    if v == -7777:
        return 0.0
    if v <= -5555:
        return None
    return v


norm = {}
for r in csv.DictReader(open(RAW / "urbana_normals_daily.csv")):
    m, d = map(int, r["DATE"].split("-"))
    norm[idx_of(m, d)] = r
assert len(norm) == N

def ncol(col):
    a = [nval(norm[i][col]) for i in range(N)]
    # fill NOAA "insufficient data" gaps by circular linear interpolation
    good = [i for i in range(N) if a[i] is not None]
    for i in range(N):
        if a[i] is None:
            p = max([g for g in good if g < i], default=good[-1] - N)
            n = min([g for g in good if g > i], default=good[0] + N)
            a[i] = a[p % N] + (a[n % N] - a[p % N]) * (i - p) / (n - p)
    return a

hi, lo, avg = ncol("DLY-TMAX-NORMAL"), ncol("DLY-TMIN-NORMAL"), ncol("DLY-TAVG-NORMAL")
rain, rain50 = ncol("DLY-PRCP-PCTALL-GE001HI"), ncol("DLY-PRCP-PCTALL-GE050HI")
snow, snow1 = ncol("DLY-SNOW-PCTALL-GE001TI"), ncol("DLY-SNOW-PCTALL-GE010TI")
ground = ncol("DLY-SNWD-PCTALL-GE001WI")

months = []
for r in csv.DictReader(open(RAW / "urbana_normals_monthly.csv")):
    g = lambda c: nval(r[c])
    months.append(dict(
        m=int(r["DATE"]), hi=g("MLY-TMAX-NORMAL"), lo=g("MLY-TMIN-NORMAL"), avg=g("MLY-TAVG-NORMAL"),
        prcp=g("MLY-PRCP-NORMAL"), snow=g("MLY-SNOW-NORMAL"),
        d90=g("MLY-TMAX-AVGNDS-GRTH090"), dFrz=g("MLY-TMIN-AVGNDS-LSTH032"),
        dIce=g("MLY-TMAX-AVGNDS-LSTH032"), dZero=g("MLY-TMIN-AVGNDS-LSTH000"),
        dRain=g("MLY-PRCP-AVGNDS-GE001HI"), dSnow=g("MLY-SNOW-AVGNDS-GE001TI"),
    ))
months.sort(key=lambda x: x["m"])

# ------------------------------------------------------------------ ACIS daily
def num(v, kind):
    if v in ("M", "S") or v.endswith("A"):
        return None
    if v == "T":
        return 0.001 if kind in ("p", "s") else 0.0
    return float(v)

acis = json.load(open(RAW / "acis_por.json"))["data"]
days = []  # (date, idx, maxt, mint, pcpn, snow, snwd)
for dstr, mx, mn, p, s, sd in acis:
    D = dt.date.fromisoformat(dstr)
    days.append((D, idx_of(D.month, D.day), num(mx, "t"), num(mn, "t"), num(p, "p"), num(s, "s"), num(sd, "d")))
last_obs = days[-1][0]

# records over the full period of record
def record(col, fn):
    best = {}
    for row in days:
        v = row[col]
        if v is None:
            continue
        i = row[1]
        if i not in best or fn(v, best[i][0]) > 0:
            best[i] = [v, [row[0].year]]
        elif v == best[i][0]:
            best[i][1].append(row[0].year)
    vals = [best[i][0] for i in range(N)]
    yrs = [sorted(set(best[i][1]), reverse=True) for i in range(N)]
    return vals, yrs

gt = lambda a, b: (a > b) - (a < b)
lt = lambda a, b: (b > a) - (b < a)
recHi, recHiY = record(2, gt)
recLo, recLoY = record(3, lt)
recLoHi, recLoHiY = record(2, lt)   # coldest high
recHiLo, recHiLoY = record(3, gt)   # warmest low
recP, recPY = record(4, gt)
recS, recSY = record(5, gt)

# percentiles + threshold chances in the 1991-2020 normals period (+/-7 day pool)
per = [r for r in days if 1991 <= r[0].year <= 2020]
bins_hi = collections.defaultdict(list)
bins_lo = collections.defaultdict(list)
for _, i, mx, mn, *_ in per:
    if mx is not None:
        bins_hi[i].append(mx)
    if mn is not None:
        bins_lo[i].append(mn)

hiP10, hiP90, loP10, loP90, p90, pFrz, pIce, pZero = ([] for _ in range(8))
for i in range(N):
    H = np.array([v for j in window(i) for v in bins_hi[j]])
    L = np.array([v for j in window(i) for v in bins_lo[j]])
    hiP10.append(np.percentile(H, 10)); hiP90.append(np.percentile(H, 90))
    loP10.append(np.percentile(L, 10)); loP90.append(np.percentile(L, 90))
    p90.append(100 * np.mean(H >= 90)); pIce.append(100 * np.mean(H <= 32))
    pFrz.append(100 * np.mean(L <= 32)); pZero.append(100 * np.mean(L <= 0))
hiP10, hiP90, loP10, loP90 = (smooth(a) for a in (hiP10, hiP90, loP10, loP90))
p90, pFrz, pIce, pZero = (smooth(a) for a in (p90, pFrz, pIce, pZero))

# freeze dates (last spring / first fall low <= 32F), 1991-2020
by_year = collections.defaultdict(list)
for row in days:
    by_year[row[0].year].append(row)
last_frz, first_frz = [], []
for y in range(1991, 2021):
    sp = [r[1] for r in by_year[y] if r[3] is not None and r[3] <= 32 and r[0].month <= 7]
    fa = [r[1] for r in by_year[y] if r[3] is not None and r[3] <= 32 and r[0].month >= 8]
    if sp: last_frz.append(max(sp))
    if fa: first_frz.append(min(fa))

def qdate(vals, q, shift=0):
    v = np.percentile(np.array(vals) , q, method="nearest")
    return md_str((int(v) + shift) % N)

# snow season (first/last >= 0.1" snowfall), winters 1990-91 .. 2019-20
aug1 = idx_of(8, 1)
first_sn, last_sn = [], []
for y in range(1990, 2020):
    season = [r for r in by_year[y] if r[0].month >= 8] + [r for r in by_year[y + 1] if r[0].month <= 7]
    hits = [((r[1] - aug1) % N) for r in season if r[5] is not None and r[5] >= 0.1]
    if hits:
        first_sn.append(min(hits)); last_sn.append(max(hits))

def sdate(vals, q):
    v = int(np.percentile(np.array(vals), q, method="nearest"))
    return md_str((v + aug1) % N)

xmas = [r for r in per if r[0].month == 12 and r[0].day == 25 and r[6] is not None]
xmas_pct = 100 * np.mean([r[6] >= 1 for r in xmas])
xmas_all = [r for r in days if r[0].month == 12 and r[0].day == 25 and r[6] is not None]

def alltime(col, fn):
    best = None
    for r in days:
        v = r[col]
        if v is None:
            continue
        if best is None or fn(v, best[0]) > 0:
            best = [v, [r[0].isoformat()]]
        elif v == best[0]:
            best[1].append(r[0].isoformat())
    return best

# ------------------------------------------------------------- KCMI hourly obs
VQ = set("01459")
MPH = 2.2369363
day_w = collections.defaultdict(lambda: dict(spd=[], sec=[0] * 8, calm=0, var=0, dp=[], gust=0.0, n=0))
for f in sorted(glob.glob(str(RAW / "isd" / "*.csv"))):
    rows = list(csv.reader(open(f)))
    if len(rows) < 2:
        continue
    h = rows[0]
    ix = {k: h.index(k) for k in ("DATE", "REPORT_TYPE", "WND", "DEW", "OC1")}
    for r in rows[1:]:
        t = dt.datetime.fromisoformat(r[ix["DATE"]]).replace(tzinfo=UTC).astimezone(CHI)
        rec = day_w[t.date()]
        oc = r[ix["OC1"]]
        if oc:
            sp, q = oc.split(",")
            if sp != "9999" and q in VQ:
                rec["gust"] = max(rec["gust"], int(sp) / 10 * MPH)
        if r[ix["REPORT_TYPE"]].strip() != "FM-15":
            continue
        rec["n"] += 1
        wd, dq, wt, ws, sq = r[ix["WND"]].split(",")
        if ws != "9999" and sq in VQ:
            s = int(ws) / 10 * MPH
            rec["spd"].append(s)
            if wt == "C" or int(ws) == 0:
                rec["calm"] += 1
            elif wd != "999" and dq in VQ:
                rec["sec"][int(((int(wd) % 360) + 22.5) // 45) % 8] += 1
            else:
                rec["var"] += 1
        dv, dqq = r[ix["DEW"]].split(",")
        if dv not in ("+9999", "9999") and dqq in VQ:
            rec["dp"].append(int(dv) / 10 * 9 / 5 + 32)

bw = collections.defaultdict(lambda: dict(spd=[], sec=np.zeros(8), calm=0, var=0, dp=[], gustdays=0, days=0))
for D, rec in day_w.items():
    b = bw[idx_of(D.month, D.day)]
    b["spd"] += rec["spd"]; b["sec"] += rec["sec"]; b["calm"] += rec["calm"]; b["var"] += rec["var"]
    b["dp"] += rec["dp"]
    if rec["n"] >= 18:
        b["days"] += 1
        b["gustdays"] += rec["gust"] >= 30
wind, calm, gust30, dew, muggy, dirs = [], [], [], [], [], []
for i in range(N):
    S, SEC, C, V, DP, GD, DD = [], np.zeros(8), 0, 0, [], 0, 0
    for j in window(i):
        b = bw[j]
        S += b["spd"]; SEC += b["sec"]; C += b["calm"]; V += b["var"]; DP += b["dp"]
        GD += b["gustdays"]; DD += b["days"]
    tot = SEC.sum() + C + V
    wind.append(np.mean(S)); calm.append(100 * C / tot)
    dirs.append(100 * SEC / tot)
    gust30.append(100 * GD / DD)
    DP = np.array(DP)
    dew.append(DP.mean()); muggy.append(100 * np.mean(DP >= 65))
wind, calm, gust30, dew, muggy = (smooth(a) for a in (wind, calm, gust30, dew, muggy))
dirs = np.array(dirs)
dirs = np.array([[np.mean([dirs[j][k] for j in window(i, 3)]) for k in range(8)] for i in range(N)])

# monthly wind/dew from daily records
mw = collections.defaultdict(lambda: dict(spd=[], sec=np.zeros(8), dp=[]))
for D, rec in day_w.items():
    x = mw[D.month]; x["spd"] += rec["spd"]; x["sec"] += rec["sec"]; x["dp"] += rec["dp"]
SECT = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
for m in months:
    x = mw[m["m"]]
    m["wind"] = r1(np.mean(x["spd"])); m["dir"] = SECT[int(np.argmax(x["sec"]))]
    m["dew"] = r1(np.mean(x["dp"])); m["muggy"] = r0(100 * np.mean(np.array(x["dp"]) >= 65))

# ------------------------------------------------------------- NASA POWER cloud
pw = json.load(open(RAW / "power.json"))["properties"]["parameter"]["CLOUD_AMT"]
bc = collections.defaultdict(list); mc = collections.defaultdict(list)
for k, v in pw.items():
    if v == -999:
        continue
    D = dt.date(int(k[:4]), int(k[4:6]), int(k[6:]))
    bc[idx_of(D.month, D.day)].append(v); mc[D.month].append(v)
cloud = smooth([np.mean([v for j in window(i) for v in bc[j]]) for i in range(N)])
for m in months:
    m["cloud"] = r0(np.mean(mc[m["m"]]))

# ------------------------------------------------------------------- summaries
def argext(arr, fn):
    a = np.array(arr, dtype=float)
    return md_str(int(fn(a)))

at_hi, at_lo = alltime(2, gt), alltime(3, lt)
at_p, at_s = alltime(4, gt), alltime(5, gt)
events = dict(
    lastFreeze=dict(median=qdate(last_frz, 50), early=qdate(last_frz, 10), late=qdate(last_frz, 90), n=len(last_frz)),
    firstFreeze=dict(median=qdate(first_frz, 50), early=qdate(first_frz, 10), late=qdate(first_frz, 90), n=len(first_frz)),
    firstSnow=dict(median=sdate(first_sn, 50), n=len(first_sn)),
    lastSnow=dict(median=sdate(last_sn, 50), n=len(last_sn)),
    growingDays=int(np.median([f - l for f, l in zip(first_frz, last_frz)])),
    whiteXmas=dict(pct=r0(xmas_pct), n=len(xmas), pctAll=r0(100 * np.mean([r[6] >= 1 for r in xmas_all])), nAll=len(xmas_all)),
    allTime=dict(hi=at_hi, lo=at_lo, pcp=at_p, snow=at_s),
    warmest=argext(avg, np.argmax), coldest=argext(avg, np.argmin),
    windiest=argext(wind, np.argmax), calmest=argext(wind, np.argmin),
    muggiest=argext(dew, np.argmax), cloudiest=argext(cloud, np.argmax), sunniest=argext(cloud, np.argmin),
    wettest=argext(rain, np.argmax),
)

out = dict(
    meta=dict(
        station="Champaign 3S (NOAA USC00118740)", stationLL=[40.0839, -88.2403],
        city="Urbana, Illinois", cityLL=[40.1106, -88.2073],
        porStart="1888-08-17", porEnd=last_obs.isoformat(),
        windStation="Willard Airport KCMI (725315-94870)", windPeriod="2006-01 to 2025-08",
        cloudSource="NASA POWER CLOUD_AMT (CERES SYN1deg)", cloudPeriod="2001-2025",
        built=dt.date.today().isoformat(),
    ),
    d=dict(
        hi=[r1(x) for x in hi], lo=[r1(x) for x in lo], avg=[r1(x) for x in avg],
        hiP10=[r0(x) for x in hiP10], hiP90=[r0(x) for x in hiP90],
        loP10=[r0(x) for x in loP10], loP90=[r0(x) for x in loP90],
        recHi=[r0(x) for x in recHi], recHiY=recHiY, recLo=[r0(x) for x in recLo], recLoY=recLoY,
        recLoHi=[r0(x) for x in recLoHi], recLoHiY=recLoHiY, recHiLo=[r0(x) for x in recHiLo], recHiLoY=recHiLoY,
        recP=[round(x, 2) for x in recP], recPY=recPY, recS=[round(x, 1) for x in recS], recSY=recSY,
        p90=[r0(x) for x in p90], pFrz=[r0(x) for x in pFrz], pIce=[r0(x) for x in pIce], pZero=[r0(x) for x in pZero],
        rain=[r0(x) for x in rain], rain50=[r0(x) for x in rain50],
        snow=[r0(x) for x in snow], snow1=[r0(x) for x in snow1], ground=[r0(x) for x in ground],
        wind=[r1(x) for x in wind], calm=[r0(x) for x in calm], gust30=[r0(x) for x in gust30],
        dir=[[r0(v) for v in row] for row in dirs],
        dew=[r1(x) for x in dew], muggy=[r0(x) for x in muggy], cloud=[r0(x) for x in cloud],
    ),
    months=[{k: (r1(v) if isinstance(v, float) else v) for k, v in m.items()} for m in months],
    events=events,
)
json.dump(out, open(OUT, "w"), separators=(",", ":"))
print("bytes", len(json.dumps(out, separators=(",", ":"))))
