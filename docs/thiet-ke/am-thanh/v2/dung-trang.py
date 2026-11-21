#!/usr/bin/env python3
"""Dựng nghe-thu.html và README.md từ ung-vien.json (chạy sau tao-am.py)."""
import json, html, os
H = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(H, "ung-vien.json"), encoding="utf-8"))
EV = [("cham", "Chạm nút", "≤ 120 ms, nhỏ hơn các âm khác 6 dB"), ("dung", "Đúng", "~400 ms"),
      ("sai", "Sai (nhẹ nhàng, không trách)", "~300–400 ms"), ("xong", "Hoàn thành bài", "~1,3 s"),
      ("chuoi", "Lên chuỗi ngày", "~1,3 s"), ("bong", "Mở bong bóng Cu Tít", "~300 ms"),
      ("noi", "Cu Tít bắt đầu nói", "~300 ms, khẽ"), ("bao", "Thông báo", "~500 ms"),
      ("tab", "Chuyển tab (rất khẽ)", "≤ 120 ms, đỉnh −16 dBFS")]
rec = {"cham": "a", "dung": "a", "sai": "c", "xong": "a", "chuoi": "b", "bong": "b", "noi": "b", "bao": "a", "tab": "b"}
by = {r["name"]: r for r in rows}
rowsH = ""
for ev, title, note in EV:
    btn = ""
    for k in "abc":
        r = by[f"{ev}-{k}"]
        star = " ★" if rec[ev] == k else ""
        btn += (f'<div class="c"><button data-n="{r["name"]}">▶ {k.upper()}{star}</button>'
                f'<span>{html.escape(r["desc"])}<br><code>{html.escape(r["formula"])}</code><br>'
                f'{r["ms"]} ms · {r["ogg"]+0} B ogg / {r["mp3"]} B mp3 · tự tổng hợp</span></div>')
    rowsH += f'<section class="row"><h2>{title}</h2><small>{note}</small><div class="g">{btn}</div></section>\n'
page = f'''<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nghe thử âm thanh bản 2 – Bé Cu Tít</title>
<style>
:root{{--bg:#fff8ec;--fg:#3b2a1a;--card:#fff;--line:#ecd9b8;--a:#3f8f6b;--mut:#8a735a}}
@media(prefers-color-scheme:dark){{:root{{--bg:#241a12;--fg:#f5e8d4;--card:#33261b;--line:#5a4531;--mut:#c2a98c}}}}
*{{box-sizing:border-box}}body{{margin:0;padding:16px;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,"Segoe UI",sans-serif}}
main{{max-width:820px;margin:0 auto}}h1{{font-size:1.4rem;margin:0 0 4px}}.lead{{color:var(--mut);margin:0 0 16px}}
.row{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px;margin-bottom:10px}}
h2{{font-size:1rem;margin:0}}small{{color:var(--mut);display:block;margin-bottom:8px}}
.g{{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}}
.c{{display:flex;flex-direction:column;gap:6px}}.c span{{font-size:.82rem;color:var(--mut)}}code{{font-size:.75rem;word-break:break-word}}
button{{min-height:48px;border:0;border-radius:12px;background:var(--a);color:#fff;font:inherit;font-weight:600;cursor:pointer}}
button:focus-visible{{outline:3px solid var(--fg);outline-offset:2px}}button.on{{filter:brightness(.8)}}
</style></head><body><main>
<h1>Nghe thử âm thanh bản 2 – chất làng quê</h1>
<p class="lead">27 ứng viên tự tổng hợp (T'rưng, mõ, đàn tranh/bầu, chuông nhỏ; thang ngũ cung Đô–Rê–Fa–Sol–La). Không dùng bản ghi nào, không vướng giấy phép. ★ = ứng viên đề xuất (chỉ nghe bằng số đo, chưa qua tai người).</p>
{rowsH}
<script>
const ok=new Audio().canPlayType('audio/ogg; codecs=opus');let cur=null,btn=null;
document.querySelectorAll('button').forEach(b=>b.onclick=()=>{{
 if(cur){{cur.pause()}}if(btn)btn.classList.remove('on');
 cur=new Audio('ung-vien/'+b.dataset.n+(ok?'.ogg':'.mp3'));btn=b;b.classList.add('on');
 cur.onended=()=>b.classList.remove('on');cur.play();}});
</script></main></body></html>'''
open(os.path.join(H, "nghe-thu.html"), "w", encoding="utf-8").write(page)

tot = sum(r["ogg"] + r["mp3"] for r in rows)
tb = "| Tệp | Mô tả | Công thức (trong `tao-am.py`) | ms | đỉnh dBFS | RMS dBFS | LUFS | ogg B | mp3 B |\n|---|---|---|---|---|---|---|---|---|\n"
for r in rows:
    tb += f'| `{r["name"]}` | {r["desc"]} | `{r["formula"]}` | {r["ms"]} | {r["peak"]} | {r["rms"]} | {r["lufs"] if r["lufs"] is not None else "–"} | {r["ogg"]} | {r["mp3"]} |\n'
readme = f'''# Bộ âm thanh bản 2 – chất làng quê (chưa gắn vào app)

Bản 1 (Kenney CC0, `../ung-vien/`) bị chê máy móc. Bản 2 **tự tổng hợp hoàn toàn** nên không có giấy phép bên thứ ba; thuộc về dự án, dùng thương mại được.
Nghe thử: mở `nghe-thu.html` (đủ 9 sự kiện × 3 ứng viên, ★ = đề xuất).

## Nguồn và giấy phép
- **Nguồn A (tự tổng hợp):** toàn bộ 27 tệp. Không lấy mẫu từ bản ghi nào.
- **Nguồn B (ghi âm CC0 Freesound):** **chưa làm** ở bản này. Ưu tiên nguồn A để khỏi vướng giấy phép; gà gáy/ếch/chuông trâu có thể bổ sung sau nếu người dùng muốn (cần đọc từng trang Freesound và tải xuống, có thể đòi đăng nhập).

## Tạo lại
```powershell
python docs/thiet-ke/am-thanh/v2/tao-am.py   # cần numpy, scipy, ffmpeg (libopus, libmp3lame)
python docs/thiet-ke/am-thanh/v2/dung-trang.py
```
Hạt giống nhiễu cố định (405) nên ra y hệt. Đặt `PYTHONUTF8=1` trên Windows nếu đường dẫn có dấu.

## Nhạc cụ (hàm trong `tao-am.py`)
- `trung(f)`: T'rưng/marimba tre: sin f + 0,45·sin 4f (tắt nhanh ×0,35) + 0,12·sin 10f (×0,12), tắt hàm mũ τ≈0,09 s, thêm tiếng búa (nhiễu 1,8–5 kHz, τ 4 ms).
- `bell(f)`: chuông nhỏ, hài 1 : 2,76 : 5,40 : 8,93 (biên độ 1/0,45/0,22/0,1).
- `pluck(f, bend)`: gảy đàn tranh/bầu, hài 1..6 (1/n^1,2), hài cao tắt nhanh; `bend` nửa cung trượt về đúng cao độ (τ 60 ms): bầu.
- `mo(f)`: mõ gỗ: sin f (+0,3·2,4f) τ≈35 ms, hơi trượt xuống, nhiễu thông thấp 2,5 kHz.
- `knock(f)`: gõ tre khô: nhiễu thông dải 1,4–4 kHz + sin f, ≤ 80 ms.
- Ngũ cung: Đô 0, Rê +2, Fa +5, Sol +7, La +9 nửa cung (A4 = 440 Hz), quãng 3–7.

## Hậu kỳ
Cắt lặng đuôi dưới −50 dB, fade vào 1 ms / ra 6 ms, mono 48 kHz → Opus `.ogg` 28 kb/s (`-application audio`) và `.mp3` 48 kb/s (libmp3lame).
Đỉnh đặt ≤ −1,5 dBFS trước mã hoá (thông báo −2 để Opus không vượt). Các âm khẽ chủ ý: chạm −7, nói −6, chuyển tab −16 dBFS đỉnh.
**LUFS:** chuẩn −16 LUFS tích hợp không xác định cho âm < 400 ms; chỉ đo được hai nhóm ~1,3 s (cột LUFS, khoảng −14 ≈ hơi to hơn đích, đỉnh đã chạm trần). Âm ngắn cân theo đỉnh + RMS. Có thể chỉnh gain khi gắn vào app.

## Số đo ({len(rows)} ứng viên, tổng {tot} B = {tot/1024:.0f} kB cả hai định dạng)
{tb}
Kiểm: độ dài, kích thước, đỉnh/RMS sau mã hoá, phổ FFT (đỉnh phổ trùng nốt dự định). **Chưa nghe bằng tai**, thẩm mỹ cần người dùng nghe.
'''
open(os.path.join(H, "README.md"), "w", encoding="utf-8").write(readme)
print(tot)
