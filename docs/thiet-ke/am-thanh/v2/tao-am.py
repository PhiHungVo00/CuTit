#!/usr/bin/env python3
"""Tổng hợp bộ âm thanh bản 2 cho Bé Cu Tít (tự tạo, không vướng giấy phép).

Chạy:  python docs/thiet-ke/am-thanh/v2/tao-am.py
Cần:   python3 + numpy + scipy, ffmpeg/ffprobe trong PATH (libopus, libmp3lame).
Sinh:  v2/ung-vien/<sự-kiện>-<a|b|c>.ogg|.mp3, v2/nghe-thu.html, v2/README.md

Mọi mẫu là nghiệm cộng sin + nhiễu lọc, KHÔNG dùng bản ghi nào => thuộc về dự án.
Thang ngũ cung Đô–Rê–Fa–Sol–La (không có Mi, Si).
"""
import json, os, subprocess, sys, tempfile, wave
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "ung-vien")
rng = np.random.default_rng(405)  # cố định => tạo lại y hệt

# Ngũ cung (Hz): Đô Rê Fa Sol La, quãng 4-6
N = {}
base = {"do": 0, "re": 2, "fa": 5, "sol": 7, "la": 9}
for octv in (3, 4, 5, 6, 7):
    for name, semi in base.items():
        N[f"{name}{octv}"] = 440.0 * 2 ** ((semi - 9 + 12 * (octv - 4)) / 12)


def t_(dur):
    return np.arange(int(SR * dur)) / SR


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, "low", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def adsr(t, tau, att=0.002):
    return (1 - np.exp(-t / att)) * np.exp(-t / tau)


# ---- nhạc cụ ---------------------------------------------------------------
def trung(f, dur=0.3, tau=0.09, amp=1.0):
    """Đàn T'rưng (ống tre): f + 4f (đã chỉnh) + 10f rất ngắn, kèm tiếng búa gõ."""
    t = t_(dur)
    s = (np.sin(2 * np.pi * f * t) * adsr(t, tau)
         + 0.45 * np.sin(2 * np.pi * 4 * f * t) * adsr(t, tau * 0.35)
         + 0.12 * np.sin(2 * np.pi * 10 * f * t) * adsr(t, tau * 0.12))
    click = bp(rng.standard_normal(len(t)), 1800, 5000) * np.exp(-t / 0.004) * 0.25
    return amp * (s + click)


def bell(f, dur=0.5, tau=0.18, amp=1.0):
    """Chuông nhỏ (leng keng): các hài không nguyên 1 : 2.76 : 5.40 : 8.93."""
    t = t_(dur)
    s = 0.0
    for r, a, k in ((1, 1.0, 1.0), (2.76, 0.45, 0.55), (5.40, 0.22, 0.3), (8.93, 0.1, 0.18)):
        s = s + a * np.sin(2 * np.pi * f * r * t) * adsr(t, tau * k, 0.001)
    return amp * s


def pluck(f, dur=0.4, tau=0.14, bend=0.0, amp=1.0):
    """Gảy đàn bầu/đàn tranh: hài 1..6 giảm dần, hài cao tắt nhanh; bend = nửa cung trượt lên (>0) hay xuống (<0) lúc đầu."""
    t = t_(dur)
    inst = f * 2 ** (-bend * np.exp(-t / 0.06) / 12)  # bắt đầu lệch rồi về đúng cao độ
    ph = 2 * np.pi * np.cumsum(inst) / SR
    s = 0.0
    for n in range(1, 7):
        s = s + (1 / n ** 1.2) * np.sin(n * ph) * adsr(t, tau / (1 + 0.5 * (n - 1)), 0.001)
    return amp * s


def mo(f=700, dur=0.18, tau=0.035, amp=1.0):
    """Mõ gỗ: sin f (+2.4f) tắt nhanh, hơi trượt xuống, kèm nhiễu lọc thông thấp."""
    t = t_(dur)
    inst = f * (1 + 0.06 * np.exp(-t / 0.01))
    ph = 2 * np.pi * np.cumsum(inst) / SR
    s = np.sin(ph) * adsr(t, tau, 0.0008) + 0.3 * np.sin(2.4 * ph) * adsr(t, tau * 0.5, 0.0008)
    n = lp(rng.standard_normal(len(t)), 2500) * np.exp(-t / 0.006) * 0.35
    return amp * (s + n)


def knock(f=1100, dur=0.08, tau=0.012, amp=1.0):
    """Tiếng gõ tre khô: nhiễu thông dải 1.4–4 kHz + sin f, rất ngắn."""
    t = t_(dur)
    n = bp(rng.standard_normal(len(t)), 1400, 4000) * np.exp(-t / (tau * 0.5))
    s = np.sin(2 * np.pi * f * t) * adsr(t, tau, 0.0006)
    return amp * (0.6 * n + s)


def mix(parts, total):
    buf = np.zeros(int(SR * total))
    for start, sig in parts:
        i = int(SR * start)
        buf[i:i + len(sig)] += sig[:len(buf) - i]
    return buf


# ---- 27 ứng viên -------------------------------------------------------------
# (sự kiện, mã, mô tả, công thức chữ, hàm sinh, mức đỉnh dBFS, đích LUFS hoặc None)
C = []


def add(ev, k, desc, formula, fn, peak=-1.5):
    C.append(dict(ev=ev, k=k, desc=desc, formula=formula, fn=fn, peak=peak))


# 1. chạm nút (rất ngắn, nhỏ hơn các âm khác 6 dB)
add("cham", "a", "Gõ tre khô rất ngắn", "knock(f=1100, dur=.08, tau=.012)",
    lambda: knock(1100, .08, .012), -7)
add("cham", "b", "Mõ gỗ cao, “tách”", "mo(f=1100, dur=.1, tau=.02)",
    lambda: mo(1100, .1, .02), -7)
add("cham", "c", "T'rưng nốt Đô6 ngắn", "trung(do6, dur=.12, tau=.03)",
    lambda: trung(N["do6"], .12, .03), -7)

# 2. đúng
add("dung", "a", "T'rưng 2 nốt đi lên Sol5 → Đô6", "trung(sol5) @0 + trung(do6) @.11",
    lambda: mix([(0, trung(N["sol5"], .25, .08)), (.11, trung(N["do6"], .3, .1))], .4))
add("dung", "b", "Gảy đàn tranh Rê5 → La5", "pluck(re5) @0 + pluck(la5) @.1",
    lambda: mix([(0, pluck(N["re5"], .25, .1)), (.1, pluck(N["la5"], .3, .13))], .4))
add("dung", "c", "Chuông nhỏ Sol5 → Đô6", "bell(sol5,.3,.1) @0 + bell(do6,.3,.12) @.1",
    lambda: mix([(0, bell(N["sol5"], .3, .1)), (.1, bell(N["do6"], .3, .12))], .4))

# 3. sai: nhẹ, đi xuống nhỏ, không chói
add("sai", "a", "Một tiếng mõ trầm mềm", "mo(f=330, dur=.3, tau=.07, amp=.9)",
    lambda: mo(330, .3, .07, .9))
add("sai", "b", "T'rưng 2 nốt xuống nhẹ La4 → Sol4 (lọc mềm)", "lp(trung(la4)@0 + trung(sol4)@.14, 1800)",
    lambda: lp(mix([(0, trung(N["la4"], .3, .1)), (.14, trung(N["sol4"], .3, .12))], .4), 1800))
add("sai", "c", "Đàn bầu trượt xuống Rê5 (bend −1.5 nửa cung)", "pluck(re5, .4, .16, bend=-1.5)",
    lambda: pluck(N["re5"], .4, .16, -1.5))

# 4. hoàn thành bài (≤ 1.5 s)
RUN5 = ["do5", "re5", "fa5", "sol5", "la5"]
add("xong", "a", "T'rưng chạy lên 5 nốt Đô–Rê–Fa–Sol–La rồi Đô6",
    "trung × 6 nốt cách .1 s; nốt cuối dài",
    lambda: mix([(i * .1, trung(N[n], .3, .09)) for i, n in enumerate(RUN5)]
                + [(.5, trung(N["do6"], .8, .25)), (.5, bell(N["do6"], .8, .25, .4))], 1.4))
add("xong", "b", "Rải đàn tranh Đô–Sol–La–Rê6 + chuông kết",
    "pluck × 4 cách .12 s + bell(do6)",
    lambda: mix([(i * .12, pluck(N[n], .5, .16)) for i, n in enumerate(["do5", "sol5", "la5", "re6"])]
                + [(.5, bell(N["sol6"], .8, .3, .5))], 1.4))
add("xong", "c", "Chuông 4 nốt Đô–Rê–Sol–Đô6 lấp lánh",
    "bell × 4 cách .13 s",
    lambda: mix([(i * .13, bell(N[n], .7 if i == 3 else .35, .3 if i == 3 else .12))
                 for i, n in enumerate(["do5", "re5", "sol5", "do6"])], 1.3))

# 5. lên chuỗi ngày (≤ 1.5 s) – ăn mừng hơn "xong"
add("chuoi", "a", "T'rưng quãng tám Đô5→Đô6 + gõ lên Sol6 lấp lánh",
    "trung(do5)@0 trung(sol5)@.1 trung(do6)@.2 + bell(sol6)@.4",
    lambda: mix([(0, trung(N["do5"], .3, .09)), (.1, trung(N["sol5"], .3, .09)),
                 (.2, trung(N["do6"], .4, .12)), (.4, bell(N["sol6"], .9, .3, .6)),
                 (.4, bell(N["do7"], .9, .25, .25))], 1.4))
add("chuoi", "b", "Đàn bầu trượt lên (bend +4) rồi chuông Đô6 + Sol6",
    "pluck(sol4,.5,.2,bend=4)@0 + bell(do6)@.3 + bell(sol6)@.45",
    lambda: mix([(0, pluck(N["sol4"] * 2, .6, .25, 4)), (.3, bell(N["do6"], .8, .25, .6)),
                 (.45, bell(N["sol6"], .9, .3, .5))], 1.4))
add("chuoi", "c", "Hai tiếng mõ “cộc-cộc” như gõ cửa rồi chuông chúc mừng",
    "mo(520)@0 mo(620)@.14 + bell(do6)@.3 + bell(sol6)@.4",
    lambda: mix([(0, mo(520, .15, .04)), (.14, mo(620, .15, .04)),
                 (.3, bell(N["do6"], .9, .28, .7)), (.4, bell(N["sol6"], .9, .3, .5))], 1.4))

# 6. mở bong bóng Cu Tít
add("bong", "a", "Bong bóng nổi lên: sin trượt 380→760 Hz + chuông nhẹ",
    "sin chirp 380→760 Hz .12 s + bell(la5,.2)",
    lambda: (lambda t: mix([(0, np.sin(2 * np.pi * np.cumsum(380 + 380 * (t / .12)) / SR)
                            * adsr(t, .06, .004) * 0.8),
                           (.07, bell(N["la5"], .25, .08, .5))], .35))(t_(.12)))
add("bong", "b", "T'rưng Fa5 → La5… nhanh, vui", "trung(fa5)@0 + trung(la5)@.08",
    lambda: mix([(0, trung(N["fa5"], .2, .07)), (.08, trung(N["la5"], .25, .09))], .35))
add("bong", "c", "Chuông mini Sol6 + Đô7 “tính tinh”", "bell(sol6,.25,.07)@0 + bell(do7,.2,.06)@.06",
    lambda: mix([(0, bell(N["sol6"], .25, .07)), (.06, bell(N["do7"], .22, .06, .6))], .35))

# 7. Cu Tít bắt đầu nói (nhẹ, “ừm”, không lấn giọng)
add("noi", "a", "Một tiếng gõ mõ khẽ rồi Rê5 gảy", "mo(520,.1,.02,.7)@0 + pluck(re5,.25,.1,amp=.6)@.06",
    lambda: mix([(0, mo(520, .1, .02, .7)), (.06, pluck(N["re5"], .25, .1, 0, .6))], .32), -6)
add("noi", "b", "T'rưng hai nốt rất khẽ Đô5 → Rê5 (như lấy hơi)", "trung(do5)@0 + trung(re5)@.07",
    lambda: mix([(0, trung(N["do5"], .18, .06)), (.07, trung(N["re5"], .22, .08))], .32), -6)
add("noi", "c", "T'rưng thấp La4 tròn, tiếng “tồng” trước khi nói", "lp(trung(la4,.3,.12),1500)",
    lambda: lp(trung(N["la4"], .3, .12), 1500), -6)

# 8. thông báo (nổi hơn chạm nút để nghe thấy)
add("bao", "a", "Chuông kép Sol5 → Đô6", "bell(sol5,.3,.1)@0 + bell(do6,.35,.14)@.16",
    lambda: mix([(0, bell(N["sol5"], .3, .1)), (.16, bell(N["do6"], .4, .15))], .55), -2.0)
add("bao", "b", "Hai tiếng mõ + T'rưng La5", "mo(800)@0 mo(800)@.1 + trung(la5)@.2",
    lambda: mix([(0, mo(800, .12, .025, .8)), (.1, mo(800, .12, .025, .8)),
                 (.2, trung(N["la5"], .3, .12))], .55), -2.0)
add("bao", "c", "Gảy đàn tranh cao Rê6 → La5", "pluck(re6)@0 + pluck(la5)@.14",
    lambda: mix([(0, pluck(N["re6"], .3, .12)), (.14, pluck(N["la5"], .4, .16))], .55), -2.0)

# 9. chuyển tab (rất khẽ: đỉnh −16 dBFS)
add("tab", "a", "Gõ tre cực khẽ", "knock(f=900,dur=.05,tau=.008)",
    lambda: knock(900, .05, .008), -16)
add("tab", "b", "T'rưng Đô5 rất ngắn, mờ", "lp(trung(do5,.1,.025),2500)",
    lambda: lp(trung(N["do5"], .1, .025), 2500), -16)
add("tab", "c", "Gảy khẽ Rê5 tắt nhanh", "lp(pluck(re5,.12,.04),3000)",
    lambda: lp(pluck(N["re5"], .12, .04), 3000), -16)


# ---- hậu kỳ & mã hoá ---------------------------------------------------------
def post(x, peak_db):
    # bỏ lặng đuôi < −50 dB so với đỉnh, vào/ra mượt
    pk = np.max(np.abs(x))
    idx = np.where(np.abs(x) > pk * 10 ** (-50 / 20))[0]
    x = x[idx[0]:idx[-1] + 1] if len(idx) else x
    x = x - np.mean(x)
    fi, fo = int(SR * .001), int(SR * .006)
    x[:fi] *= np.linspace(0, 1, fi)
    x[-fo:] *= np.linspace(1, 0, fo)
    return x / np.max(np.abs(x)) * 10 ** (peak_db / 20)


def lufs(path):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true",
                        "-f", "null", "-"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    I = None
    for line in r.stderr.splitlines()[-25:]:
        if line.strip().startswith("I:"):
            I = float(line.split()[1])
    return I


def write_wav(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype("<i2").tobytes())


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    tmp = tempfile.mkdtemp()
    for c in C:
        x = post(c["fn"](), c["peak"])
        name = f"{c['ev']}-{c['k']}"
        wav = os.path.join(tmp, name + ".wav")
        write_wav(wav, x)
        ogg, mp3 = (os.path.join(OUT, name + e) for e in (".ogg", ".mp3"))
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-c:a", "libopus",
                        "-b:a", "28k", "-application", "audio", ogg], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-c:a", "libmp3lame",
                        "-b:a", "48k", mp3], check=True)
        # đo lại từ tệp đã giải mã (peak sau mã hoá)
        dec = os.path.join(tmp, name + "-dec.wav")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", ogg, "-ar", str(SR), dec], check=True)
        with wave.open(dec) as w:
            y = np.frombuffer(w.readframes(w.getnframes()), "<i2") / 32768.0
        rows.append(dict(name=name, ev=c["ev"], k=c["k"], desc=c["desc"], formula=c["formula"],
                         ms=round(len(x) / SR * 1000), peak=round(20 * np.log10(np.max(np.abs(y))), 1),
                         rms=round(20 * np.log10(np.sqrt(np.mean(y ** 2))), 1),
                         lufs=lufs(ogg) if len(x) / SR >= 0.9 else None,
                         ogg=os.path.getsize(ogg), mp3=os.path.getsize(mp3)))
    json.dump(rows, open(os.path.join(HERE, "ung-vien.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps(rows, ensure_ascii=False))


if __name__ == "__main__":
    main()
