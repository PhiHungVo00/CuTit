# Bộ âm thanh bản 2 – chất làng quê (chưa gắn vào app)

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

## Số đo (27 ứng viên, tổng 173930 B = 170 kB cả hai định dạng)
| Tệp | Mô tả | Công thức (trong `tao-am.py`) | ms | đỉnh dBFS | RMS dBFS | LUFS | ogg B | mp3 B |
|---|---|---|---|---|---|---|---|---|
| `cham-a` | Gõ tre khô rất ngắn | `knock(f=1100, dur=.08, tau=.012)` | 70 | -8.4 | -21.3 | – | 376 | 812 |
| `cham-b` | Mõ gỗ cao, “tách” | `mo(f=1100, dur=.1, tau=.02)` | 100 | -7.7 | -21.4 | – | 554 | 1100 |
| `cham-c` | T'rưng nốt Đô6 ngắn | `trung(do6, dur=.12, tau=.03)` | 120 | -6.8 | -19.6 | – | 608 | 1100 |
| `dung-a` | T'rưng 2 nốt đi lên Sol5 → Đô6 | `trung(sol5) @0 + trung(do6) @.11` | 400 | -1.9 | -14.4 | – | 1518 | 2828 |
| `dung-b` | Gảy đàn tranh Rê5 → La5 | `pluck(re5) @0 + pluck(la5) @.1` | 400 | -1.2 | -13.7 | – | 1720 | 2828 |
| `dung-c` | Chuông nhỏ Sol5 → Đô6 | `bell(sol5,.3,.1) @0 + bell(do6,.3,.12) @.1` | 400 | -1.2 | -14.8 | – | 2106 | 2828 |
| `sai-a` | Một tiếng mõ trầm mềm | `mo(f=330, dur=.3, tau=.07, amp=.9)` | 300 | -1.8 | -15.5 | – | 1345 | 2252 |
| `sai-b` | T'rưng 2 nốt xuống nhẹ La4 → Sol4 (lọc mềm) | `lp(trung(la4)@0 + trung(sol4)@.14, 1800)` | 400 | -1.4 | -12.9 | – | 1793 | 2828 |
| `sai-c` | Đàn bầu trượt xuống Rê5 (bend −1.5 nửa cung) | `pluck(re5, .4, .16, bend=-1.5)` | 400 | -1.3 | -13.3 | – | 1200 | 2828 |
| `xong-a` | T'rưng chạy lên 5 nốt Đô–Rê–Fa–Sol–La rồi Đô6 | `trung × 6 nốt cách .1 s; nốt cuối dài` | 1300 | -1.2 | -15.8 | -14.7 | 8237 | 8300 |
| `xong-b` | Rải đàn tranh Đô–Sol–La–Rê6 + chuông kết | `pluck × 4 cách .12 s + bell(do6)` | 1300 | -2.0 | -15.9 | -14.5 | 8573 | 8300 |
| `xong-c` | Chuông 4 nốt Đô–Rê–Sol–Đô6 lấp lánh | `bell × 4 cách .13 s` | 1090 | -1.1 | -14.5 | -13.5 | 7460 | 7004 |
| `chuoi-a` | T'rưng quãng tám Đô5→Đô6 + gõ lên Sol6 lấp lánh | `trung(do5)@0 trung(sol5)@.1 trung(do6)@.2 + bell(sol6)@.4` | 1300 | -1.5 | -16.2 | -14.7 | 8588 | 8300 |
| `chuoi-b` | Đàn bầu trượt lên (bend +4) rồi chuông Đô6 + Sol6 | `pluck(sol4,.5,.2,bend=4)@0 + bell(do6)@.3 + bell(sol6)@.45` | 1350 | -1.8 | -14.6 | -13.6 | 8895 | 8588 |
| `chuoi-c` | Hai tiếng mõ “cộc-cộc” như gõ cửa rồi chuông chúc mừng | `mo(520)@0 mo(620)@.14 + bell(do6)@.3 + bell(sol6)@.4` | 1300 | -1.6 | -16.0 | -13.8 | 8889 | 8300 |
| `bong-a` | Bong bóng nổi lên: sin trượt 380→760 Hz + chuông nhẹ | `sin chirp 380→760 Hz .12 s + bell(la5,.2)` | 320 | -1.3 | -13.1 | – | 1445 | 2396 |
| `bong-b` | T'rưng Fa5 → La5… nhanh, vui | `trung(fa5)@0 + trung(la5)@.08` | 330 | -1.7 | -14.2 | – | 1449 | 2396 |
| `bong-c` | Chuông mini Sol6 + Đô7 “tính tinh” | `bell(sol6,.25,.07)@0 + bell(do7,.2,.06)@.06` | 280 | -2.1 | -15.8 | – | 1358 | 2108 |
| `noi-a` | Một tiếng gõ mõ khẽ rồi Rê5 gảy | `mo(520,.1,.02,.7)@0 + pluck(re5,.25,.1,amp=.6)@.06` | 310 | -6.1 | -17.9 | – | 1082 | 2252 |
| `noi-b` | T'rưng hai nốt rất khẽ Đô5 → Rê5 (như lấy hơi) | `trung(do5)@0 + trung(re5)@.07` | 290 | -6.2 | -18.5 | – | 1304 | 2252 |
| `noi-c` | T'rưng thấp La4 tròn, tiếng “tồng” trước khi nói | `lp(trung(la4,.3,.12),1500)` | 300 | -6.7 | -16.9 | – | 906 | 2252 |
| `bao-a` | Chuông kép Sol5 → Đô6 | `bell(sol5,.3,.1)@0 + bell(do6,.35,.14)@.16` | 550 | -1.6 | -15.9 | – | 2978 | 3692 |
| `bao-b` | Hai tiếng mõ + T'rưng La5 | `mo(800)@0 mo(800)@.1 + trung(la5)@.2` | 500 | -2.1 | -15.5 | – | 2076 | 3404 |
| `bao-c` | Gảy đàn tranh cao Rê6 → La5 | `pluck(re6)@0 + pluck(la5)@.14` | 540 | -2.5 | -14.5 | – | 2506 | 3692 |
| `tab-a` | Gõ tre cực khẽ | `knock(f=900,dur=.05,tau=.008)` | 46 | -16.5 | -30.0 | – | 320 | 668 |
| `tab-b` | T'rưng Đô5 rất ngắn, mờ | `lp(trung(do5,.1,.025),2500)` | 100 | -16.3 | -28.3 | – | 538 | 1100 |
| `tab-c` | Gảy khẽ Rê5 tắt nhanh | `lp(pluck(re5,.12,.04),3000)` | 120 | -16.7 | -27.9 | – | 598 | 1100 |

Kiểm: độ dài, kích thước, đỉnh/RMS sau mã hoá, phổ FFT (đỉnh phổ trùng nốt dự định). **Chưa nghe bằng tai**, thẩm mỹ cần người dùng nghe.
