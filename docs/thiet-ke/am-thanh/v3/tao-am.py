#!/usr/bin/env python3
"""Bản 3 âm thanh Bé Cu Tít: âm quê (cắt từ bản ghi CC0/PD), âm lai, 3 nhạc nền tự tổng hợp.

Chạy:  SRC_AM=<thư mục chứa bản ghi gốc> python docs/thiet-ke/am-thanh/v3/tao-am.py
Cần:   python3 + numpy + scipy, ffmpeg/ffprobe (libopus, libmp3lame) trong PATH.
Bản ghi gốc (tên tệp + nguồn xem README): ga-small.ogg ga-medium.ogg birdchirping071414.wav
  croak_01.mp3 ribbit_01.mp3 park_ambience_birds.wav park_ambience_wind.wav park_ambience_river.wav
Sinh:  v3/que/*.ogg|mp3, v3/lai/*.ogg|mp3, v3/nen/*.ogg, v3/nguon.json
Tái dùng nhạc cụ trong v2/tao-am.py (T'rưng, chuông, đàn tranh/bầu, mõ, gõ tre), thêm sáo trúc.
"""
import importlib.util, json, os, subprocess, tempfile, wave
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("SRC_AM", os.path.join(HERE, "goc"))
spec = importlib.util.spec_from_file_location("v2", os.path.join(HERE, "..", "v2", "tao-am.py"))
v2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v2)
SR, N, t_, lp, bp = v2.SR, v2.N, v2.t_, v2.lp, v2.bp
trung, bell, pluck, mo, knock, mix = v2.trung, v2.bell, v2.pluck, v2.mo, v2.knock, v2.mix
rng = np.random.default_rng(405)
v2.rng = rng


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)


# ---------------------------------------------------------------- vào/ra tệp
def load(path):
    r = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                       capture_output=True, check=True)
    return np.frombuffer(r.stdout, "<f4").astype(np.float64)


def write_wav(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def encode(x, base, kbps=28, mp3=True):
    tmp = tempfile.mkdtemp()
    wav = os.path.join(tmp, "a.wav")
    write_wav(wav, x)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-c:a", "libopus",
                    "-b:a", f"{kbps}k", "-application", "audio", base + ".ogg"], check=True)
    if mp3:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-c:a", "libmp3lame",
                        "-b:a", "48k", base + ".mp3"], check=True)


def lufs(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    for line in r.stderr.splitlines()[-25:]:
        if line.strip().startswith("I:"):
            return float(line.split()[1])


def env(x, win=0.02):
    n = int(SR * win)
    return np.sqrt(np.convolve(x ** 2, np.ones(n) / n, "same"))


def fade(x, fi=0.01, fo=0.05):
    x = x.copy()
    a, b = int(SR * fi), int(SR * fo)
    x[:a] *= np.linspace(0, 1, a) if a else 1
    x[-b:] *= np.linspace(1, 0, b) if b else 1
    return x


def peak_to(x, db):
    return x / np.max(np.abs(x)) * 10 ** (db / 20)


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)


# ---------------------------------------------------------------- âm quê (cắt)
def crow(x, maxdur=1.8):
    """Cắt một tiếng gáy: từ lúc năng lượng vượt 12% đỉnh tới khi tắt < 6% (tối đa maxdur)."""
    e = env(x, 0.03)
    th = e.max()
    i0 = int(np.argmax(e > 0.12 * th))
    i0 = max(0, i0 - int(SR * 0.04))
    seg = x[i0:i0 + int(SR * maxdur)]
    e2 = env(seg, 0.03)
    idx = np.where(e2 > 0.06 * th)[0]
    seg = seg[:idx[-1] + int(SR * 0.05)] if len(idx) else seg
    return seg, i0 / SR


def best_window(x, dur, hop=0.25, mode="loud"):
    """Cửa sổ dur giây có năng lượng lớn nhất (loud) hoặc đều nhất (steady = RMS cao, crest thấp)."""
    n, h = int(SR * dur), int(SR * hop)
    best, bi = -1, 0
    for i in range(0, max(1, len(x) - n), h):
        w = x[i:i + n]
        s = np.sqrt(np.mean(w ** 2))
        if mode == "steady":
            s = s / (np.max(np.abs(w)) + 1e-9)
        if s > best:
            best, bi = s, i
    return x[bi:bi + n], bi / SR


def clean_cut(x, dur, name, notes):
    y = fade(hp(x, 120), 0.03, 0.12)
    return y


QUE = {}   # tên -> (tín hiệu đã chuẩn peak, ghi chú)
META = []


def make_que():
    os.makedirs(os.path.join(HERE, "que"), exist_ok=True)
    out = {}
    for tag, fn in (("small", "ga-small.ogg"), ("medium", "ga-medium.ogg")):
        x = load(os.path.join(SRC, fn))
        seg, t0 = crow(x)
        out[f"ga-gay-{tag}"] = (fade(seg, 0.01, 0.15), f"cắt {t0:.2f}s–{t0 + len(seg) / SR:.2f}s của {fn}", "gáy")
    x = load(os.path.join(SRC, "birdchirping071414.wav"))
    seg, t0 = best_window(hp(x, 250), 2.2)
    out["chim-rip-rit"] = (fade(seg, 0.05, 0.3), f"cửa sổ 2,2 s từ {t0:.1f}s, lọc thông cao 250 Hz", "chim")
    for k, fn in (("ech-1", "croak_01.mp3"), ("ech-2", "ribbit_01.mp3")):
        x = load(os.path.join(SRC, fn))
        idx = np.where(env(x, 0.02) > 0.05 * env(x, 0.02).max())[0]
        seg = x[max(0, idx[0] - int(SR * .02)):idx[-1] + int(SR * .05)][:int(SR * 1.5)]
        out[k] = (fade(seg, 0.01, 0.08), f"bỏ lặng đầu/đuôi của {fn}", "ếch")
    w = load(os.path.join(SRC, "park_ambience_wind.wav"))
    seg, t0 = best_window(hp(w, 80), 3.5, 0.5, "steady")
    out["gio-lua"] = (fade(seg, 0.6, 0.9), f"cửa sổ đều 3,5 s từ {t0:.1f}s (gió công viên, thay cho gió tre)", "gió")
    r = load(os.path.join(SRC, "park_ambience_river.wav"))
    seg, t0 = best_window(hp(r, 80), 3.5, 0.5, "steady")
    out["nuoc-suoi"] = (fade(seg, 0.6, 0.9), f"cửa sổ đều 3,5 s từ {t0:.1f}s (sông công viên)", "nước")
    # chuông/mõ trâu: TỰ TỔNG HỢP (chưa tìm được bản ghi CC0 đọc được giấy phép)
    t1 = mix([(0, bell(820, .55, .2, 1.0)), (0.0, mo(430, .2, .045, .9)),
              (.42, bell(780, .55, .2, .8)), (.42, mo(410, .2, .045, .7)),
              (.95, bell(840, .6, .22, .9)), (.95, mo(440, .2, .045, .8))], 1.7)
    out["chuong-trau"] = (t1, "tự tổng hợp: bell(820/780/840 Hz) + mo(430 Hz) lắc 3 tiếng lệch nhịp", "chuông")
    t2 = mix([(0, mo(520, .22, .07)), (.28, mo(480, .22, .07, .9)), (.6, mo(520, .22, .07, .85)),
              (.88, mo(470, .22, .07, .8))], 1.3)
    out["mo-trau"] = (lp(t2, 3000), "tự tổng hợp: mo(520/480/520/470 Hz) cách ~0,3 s, lọc mềm 3 kHz", "mõ")
    for k, (x, note, kind) in out.items():
        x = x - np.mean(x)
        pk = -3 if kind in ("gió", "nước") else -2
        y = peak_to(x, pk)
        encode(y, os.path.join(HERE, "que", k), 32)
        QUE[k] = y
        META.append(dict(nhom="que", ten=k, ghi=note, loai=kind, ms=round(len(y) / SR * 1000)))
    return out


# ---------------------------------------------------------------- lai (đã chọn + lớp quê)
def make_lai():
    os.makedirs(os.path.join(HERE, "lai"), exist_ok=True)
    base = lambda n: load(os.path.join(HERE, "chon", n + ".ogg"))

    def layer(name, main, under, gain_db, start=0.0, maxdur=1.5, tail=0.0, desc=""):
        m = main
        u = under * 10 ** (gain_db / 20) * (np.max(np.abs(main)) / np.max(np.abs(under)))
        length = max(len(m), int(SR * (start + len(u) / SR)))
        buf = np.zeros(length)
        buf[:len(m)] += m
        i = int(SR * start)
        buf[i:i + len(u)] += u[:length - i]
        buf = buf[:int(SR * maxdur)]
        y = peak_to(fade(buf, 0.002, 0.25), -1.5)
        encode(y, os.path.join(HERE, "lai", name), 28)
        META.append(dict(nhom="lai", ten=name, ghi=desc, ms=round(len(y) / SR * 1000)))
        return y

    chim = QUE["chim-rip-rit"][int(SR * 0.0):int(SR * 1.4)]
    layer("hoan-thanh-chim", base("hoan-thanh"), chim, -17, 0.05, 1.5,
          desc="hoan-thanh (xong-a) + chim ríu rít CC0 khẽ −17 dB phía sau, đuôi 0,25 s")
    ga = QUE["ga-gay-small"]
    layer("chuoi-ngay-ga", base("chuoi-ngay"), lp(ga, 6000)[:int(SR * 1.3)], -13, 0.0, 1.45,
          desc="chuoi-ngay (chuoi-a) + gà gáy PD khẽ −13 dB phía sau")
    layer("chuoi-ngay-chim", base("chuoi-ngay"), QUE["chim-rip-rit"][int(SR * .3):int(SR * 1.6)], -16, 0.0, 1.45,
          desc="chuoi-ngay + chim ríu rít khẽ −16 dB (phương án không gáy)")


# ---------------------------------------------------------------- sáo trúc
def sao(f, dur, amp=1.0):
    t = t_(dur + 0.12)
    e = np.minimum(1, t / 0.045) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.045))
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.4 * t) * np.clip((t - 0.12) / 0.2, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    s = np.sin(ph) + 0.28 * np.sin(2 * ph) + 0.07 * np.sin(3 * ph)
    br = bp(rng.standard_normal(len(t)), 2 * f, min(6 * f, 12000)) * 0.12 * (0.5 + 0.5 * np.exp(-t / 0.09))
    return amp * e * (s + br)


# ---------------------------------------------------------------- nhạc nền
S = ["do4", "re4", "fa4", "sol4", "la4", "do5", "re5", "fa5", "sol5", "la5", "do6", "re6", "fa6", "sol6", "la6"]
IDX = {c: i for i, c in enumerate("0123456789abcde")}


def parse(bars):
    """Mỗi ô 8 ký tự: chữ số/chữ = nốt (chỉ số trong S), '-' kéo dài, '.' nghỉ. -> [(slot, idx, số ô)]"""
    ev, cur = [], None
    for b, bar in enumerate(bars):
        for s, ch in enumerate(bar):
            pos = b * 8 + s
            if ch in IDX:
                cur = [pos, IDX[ch], 1]; ev.append(cur)
            elif ch == "-" and cur:
                cur[2] += 1
            else:
                cur = None
    return ev


def make_bed(srcfile, L, rel_db, tail, seed, files=None):
    """Lấy L+tail giây từ bản ghi dài, chọn đoạn êm (ít đột biến), nối vòng bằng hòa trộn công suất đều."""
    x = hp(load(os.path.join(SRC, srcfile)), 120)
    g = np.random.default_rng(seed)
    n, X = int(SR * L), int(SR * tail)
    best, bs = 1e9, None
    for _ in range(14):
        i = int(g.integers(0, len(x) - n - X))
        w = x[i:i + n + X]
        c = np.max(np.abs(w)) / (np.sqrt(np.mean(w ** 2)) + 1e-9)
        if c < best:
            best, bs = c, w
    seg = bs
    out = seg[:n].copy()
    fi = np.sin(np.linspace(0, np.pi / 2, X)); fo = np.cos(np.linspace(0, np.pi / 2, X))
    out[:X] = out[:X] * fi + seg[n:n + X] * fo
    out = lp(out, 9000)
    return out, rel_db


def reverb(x, wet=0.16, rt=0.35, seed=7):
    g = np.random.default_rng(seed)
    t = np.arange(int(SR * 1.1)) / SR
    ir = g.standard_normal(len(t)) * np.exp(-t / rt)
    ir = lp(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    y = fftconvolve(x, ir)[:len(x)]
    return (1 - wet) * x + wet * y * 0.9


def render_track(name, bpm, nbars, lead_bars, roots, lead_kind, bed_file, bed_rel, acc, desc, seed):
    L = nbars * 4 * 60 / bpm          # giây (4 phách/ô)
    slot = 60 / bpm / 2
    tail = 3.0
    buf = np.zeros(int(SR * (L + tail)))
    lead = parse(lead_bars)

    def put(sig, t0):
        i = int(SR * t0)
        if i < len(buf):
            buf[i:i + len(sig)] += sig[:len(buf) - i]

    for pos, idx, ln in lead:
        f = N[S[idx]]
        d = ln * slot
        k = lead_kind(pos // 8)
        if k == "sao":
            put(sao(f, d * 0.92, 0.55), pos * slot)
        elif k == "trung":
            put(trung(f, 0.32, 0.1, 0.5), pos * slot)
        else:   # bau
            put(pluck(f, min(d + .3, 1.6), max(.12, d * .45), 0.0, 0.5), pos * slot)
        if lead_kind(pos // 8) == "sao" and acc.get("double_sao_trung"):
            put(trung(f, 0.2, 0.06, 0.18), pos * slot)
    ROOT = {"do": 0, "fa": 2, "sol": 3}
    for b in range(nbars):
        r = roots[b % len(roots)]
        base = ROOT[r]
        fifth = {"do": "sol4", "fa": "do5", "sol": "re5"}[r]
        octv = {"do": "do5", "fa": "fa5", "sol": "sol5"}[r]
        rn = N[S[base]]
        # arpeggio T'rưng
        pat = acc["arp"]
        for s in range(8):
            if pat[s] == ".":
                continue
            f = {"r": rn, "f": N[fifth], "o": N[octv]}[pat[s]]
            put(trung(f, 0.28, 0.08, acc["arp_amp"]), (b * 8 + s) * slot)
        # bass gảy
        bf = N[{"do": "do3", "fa": "fa3", "sol": "sol3"}[r]]
        put(pluck(bf, 0.9, 0.3, 0.0, acc["bass_amp"]), b * 8 * slot)
        if acc.get("bass2"):
            put(pluck(bf * 1.5, 0.6, 0.2, 0.0, acc["bass_amp"] * .6), (b * 8 + 4) * slot)
        # mõ nhịp
        for s in acc.get("mo", []):
            put(mo(acc.get("mo_f", 700), 0.14, 0.03, acc["mo_amp"]), (b * 8 + s) * slot)
    buf = reverb(buf, acc.get("wet", 0.16))
    # gập đuôi vào đầu => vòng liền
    n, X = int(SR * L), int(SR * tail)
    music = buf[:n].copy()
    music[:X] += buf[n:n + X]
    music = hp(music, 70) if False else music - np.mean(music)
    music /= np.sqrt(np.mean(music ** 2))
    bed, rel = make_bed(bed_file, L, bed_rel, 2.0, seed)
    bed = bed / (np.sqrt(np.mean(bed ** 2)) + 1e-9)
    mixd = music + bed * 10 ** (rel / 20)
    mixd = mixd / np.max(np.abs(mixd)) * 10 ** (-6 / 20)
    os.makedirs(os.path.join(HERE, "nen"), exist_ok=True)
    base_path = os.path.join(HERE, "nen", name)
    encode(mixd, base_path, 46, mp3=False)
    size = os.path.getsize(base_path + ".ogg")
    # kiểm điểm lặp: sai khác mẫu cuối→đầu so với bước mẫu trung vị
    step = np.median(np.abs(np.diff(mixd)))
    jump = abs(mixd[0] - mixd[-1])
    # đo lại từ tệp đã mã hoá (đoạn 20 ms quanh biên)
    dec = os.path.join(tempfile.mkdtemp(), "d.wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", base_path + ".ogg", "-ar", str(SR), dec], check=True)
    with wave.open(dec) as w:
        y = np.frombuffer(w.readframes(w.getnframes()), "<i2") / 32768.0
    wrap = np.concatenate([y[-int(SR * .02):], y[:int(SR * .02)]])
    micro = float(np.max(np.abs(np.diff(wrap))) / (np.max(np.abs(np.diff(y))) + 1e-9))
    META.append(dict(nhom="nen", ten=name, ghi=desc, giay=round(L, 1), bpm=bpm, kb=round(size / 1000),
                     lufs=lufs(base_path + ".ogg"), buoc_nhay=round(float(jump / (step + 1e-12)), 2),
                     nhay_sau_ma_hoa=round(micro, 2)))


def make_nen():
    A = ["5.6.8-6.", "9-8-6.5.", "6.8.9-8.", "6-5-3---"]
    A2 = ["5.6.8-9.", "a-9-8.6.", "8.9.a-9.", "8-6-5---"]
    B = ["a.b.a-9.", "8-9-a---", "d.b.a.9.", "8-6-8-9-"]
    B2 = ["a.b.d-b.", "a-9-8.9.", "a.9.8.6.", "5-6-8---"]
    E = ["8.9.8-6.", "5.6.8-6.", "5-3-5---", "5-------"]
    sang = A + A2 + B + B2 + A + A2 + E
    R1 = ["do", "fa", "sol", "do"] * 3 + ["fa", "sol", "fa", "do"] * 2 + ["do", "fa", "sol", "do"] * 2
    # phrase order: A A2 B B2 A A2 E  => roots theo từng cụm 4 ô
    R1 = (["do", "fa", "sol", "do"] * 2 + ["fa", "sol", "fa", "do"] * 2 + ["do", "fa", "sol", "do"] * 2
          + ["fa", "sol", "do", "do"])
    render_track("sang-lang", 100, 28, sang, R1, lambda b: "sao",
                 "park_ambience_birds.wav", -22,
                 dict(arp="rfofrfof", arp_amp=0.34, bass_amp=0.5, bass2=True, mo=[], mo_amp=0, wet=0.16,
                      double_sao_trung=True),
                 "Sáng làng: sáo trúc dẫn, T'rưng rải ngũ cung, đàn tranh gảy trầm, chim đồng quê rất khẽ", 11)
    CA = ["9---8-6-", "5---6-8-", "9---a-9-", "8-------"]
    CB = ["a---b-a-", "9---8-9-", "a-9-8-6-", "5-------"]
    CE = ["6---8-9-", "8-6-5-3-", "5-6-5---", "5-------"]
    CE2 = ["5---6-5-", "3---5---", "5-6-8-6-", "5-------"]
    chieu = CA + CB + CA + CB + CE + CE2
    R2 = ["do", "fa", "do", "sol"] * 6
    render_track("chieu-dong", 76, 24, chieu, R2, lambda b: "bau" if (b // 4) in (0, 2, 4) else "sao",
                 "park_ambience_wind.wav", -17,
                 dict(arp="r.f.o.f.", arp_amp=0.26, bass_amp=0.5, bass2=False, mo=[], mo_amp=0, wet=0.24),
                 "Chiều đồng: đàn bầu gảy luân phiên sáo, ngân dài, gió lùa khẽ", 22)
    TA = ["5.5.6.8.", "9.8.6.5.", "6.6.8.9.", "8.6.5---"]
    TB = ["8.8.9.a.", "9.8.9.8.", "a.a.b.a.", "9.8.6---"]
    TE = ["6.8.9.a.", "d.b.a.9.", "8.6.8.6.", "5-------"]
    trau = TA + TA + TB + TA + TA + TB + TA + TE
    R3 = ["do", "do", "fa", "sol"] * 8
    render_track("trau-ve", 112, 32, trau, R3, lambda b: "sao" if (b // 4) in (2, 5, 7) else "trung",
                 "park_ambience_river.wav", -20,
                 dict(arp="r.f.r.f.", arp_amp=0.2, bass_amp=0.5, bass2=True, mo=[2, 6], mo_f=820, mo_amp=0.22,
                      wet=0.14),
                 "Trâu về: T'rưng nhảy nhịp 112, sáo trúc ở đoạn B, mõ gõ phách nghịch, suối róc rách", 33)


# ---------------------------------------------------------------- trang nghe thử
def write_html():
    meta = json.dumps(META, ensure_ascii=False)
    tpl = open(os.path.join(HERE, "nghe-thu.tpl.html"), encoding="utf-8").read()
    open(os.path.join(HERE, "nghe-thu.html"), "w", encoding="utf-8").write(tpl.replace("/*META*/[]", meta))


if __name__ == "__main__":
    make_que()
    make_lai()
    make_nen()
    json.dump(META, open(os.path.join(HERE, "nguon.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(META, ensure_ascii=False, indent=1))
    if os.path.exists(os.path.join(HERE, "nghe-thu.tpl.html")):
        write_html()
