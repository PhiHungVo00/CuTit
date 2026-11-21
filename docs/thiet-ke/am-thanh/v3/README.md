# Âm thanh bản 3 – Bé Cu Tít (chưa gắn vào app)

Nghe thử: mở [`nghe-thu.html`](nghe-thu.html) thẳng trong Chrome (đường dẫn tương đối, không cần máy chủ).
Tạo lại: `SRC_AM=<thư mục bản ghi gốc> python docs/thiet-ke/am-thanh/v3/tao-am.py` (cần numpy, scipy, ffmpeg có libopus + libmp3lame). Script dùng lại nhạc cụ của `v2/tao-am.py`, thêm sáo trúc. Seed cố định nên tạo lại ra y hệt.
**Chưa nghe bằng tai** (phiên làm không có loa): chỉ kiểm bằng số đo và mở trang trong trình duyệt. Người dùng cần nghe để chốt.

## Thư mục

| Thư mục | Nội dung |
|---|---|
| `chon/` | 9 âm người dùng đã chọn ở v2 (ogg + mp3), đặt tên theo sự kiện |
| `que/` | 9 âm làng quê (ogg + mp3): 7 cắt từ bản ghi CC0/công cộng, 2 tự tổng hợp |
| `lai/` | 3 bản lai: âm đã chọn + lớp quê khẽ phía sau (ogg + mp3) |
| `nen/` | 3 nhạc nền vòng lặp (chỉ ogg Opus mono 46 kb/s) |
| `nguon.json` | Số đo từng tệp (độ dài, kB, LUFS, kiểm điểm lặp) |

Tổng dung lượng thư mục v3 ≈ 1,6 MB (nhạc nền 1,36 MB, còn lại ~0,3 MB cả ogg lẫn mp3). Mỗi bản nhạc nền ≤ 485 kB (mục tiêu 600 kB).

### Bộ đã chọn (`chon/`, nguồn là v2, tự tổng hợp, thuộc về dự án)

| Sự kiện | Tệp | Gốc ở v2 |
|---|---|---|
| Chạm nút | `cham-nut` | cham-a |
| Đúng | `dung` | dung-a |
| Sai | `sai` | sai-b |
| Hoàn thành bài | `hoan-thanh` | xong-a |
| Lên chuỗi ngày | `chuoi-ngay` | chuoi-a |
| Mở bong bóng | `mo-bong-bong` | bong-a |
| Cu Tít nói | `cutit-noi` | noi-c |
| Thông báo | `thong-bao` | bao-b |
| Chuyển tab | `chuyen-tab` | tab-a |

## Âm quê: nguồn và giấy phép

Chỉ dùng nguồn không cần đăng nhập, giấy phép đọc được trên trang. Giấy phép đã đọc ngày 2026-11-20.

| Tệp trong `que/` | Bản ghi gốc | Tác giả | Giấy phép | Trang |
|---|---|---|---|---|
| `ga-gay-small` | Small rooster crowing.ogg | alys | Public domain (Commons) | https://commons.wikimedia.org/wiki/File:Small_rooster_crowing.ogg |
| `ga-gay-medium` | Medium rooster crowing.ogg | alys | Public domain (Commons) | https://commons.wikimedia.org/wiki/File:Medium_rooster_crowing.ogg |
| `chim-rip-rit` | birdchirping071414.wav | syncopika | CC0 (OpenGameArt) | https://opengameart.org/content/bird-chirping-sounds (node/25952) |
| `ech-1` | croak_01.mp3 | EZduzziteh | CC0 (OpenGameArt) | https://opengameart.org/content/frog-croaks |
| `ech-2` | ribbit_01.mp3 | EZduzziteh | CC0 (OpenGameArt) | https://opengameart.org/content/ribbit-frog-sounds |
| `gio-lua` | park_ambience_wind.wav | Thimras | CC0 (OpenGameArt) | https://opengameart.org/content/park-ambiences |
| `nuoc-suoi` | park_ambience_river.wav | Thimras | CC0 (OpenGameArt) | https://opengameart.org/content/park-ambiences |
| `chuong-trau` | tự tổng hợp | dự án | không vướng | công thức dưới đây |
| `mo-trau` | tự tổng hợp | dự án | không vướng | công thức dưới đây |

Nền ruộng trong 3 nhạc nền lấy từ `park_ambience_birds.wav`, `park_ambience_wind.wav`, `park_ambience_river.wav` (cùng gói Park ambiences, CC0).
Tên tác giả ghi theo tên người đăng trên trang; trang Commons ghi "alys" ở trường Artist. CC0 và public domain không buộc ghi công, nhưng nên giữ bảng này trong `docs/` để truy nguồn.

**Công thức hai âm tự tổng hợp**
- `chuong-trau`: `bell(820)@0 + mo(430)@0`, `bell(780)@.42 + mo(410)@.42`, `bell(840)@.95 + mo(440)@.95` (ba tiếng lệch nhịp như trâu lắc đầu).
- `mo-trau`: `mo(520)@0, mo(480)@.28, mo(520)@.6, mo(470)@.88`, rồi lọc thông thấp 3 kHz.

**Cách cắt**: tiếng gáy lấy từ lúc năng lượng vượt 12% đỉnh đến khi tắt dưới 6% (tối đa 1,8 s); chim lấy cửa sổ 2,2 s to nhất, lọc thông cao 250 Hz; gió và nước lấy cửa sổ 3,5 s đều nhất, vào/ra mượt 0,6/0,9 s; ếch bỏ lặng đầu đuôi. Đỉnh −2 dBFS (gió, nước −3).

**Đề xuất gắn**
| Âm | Gắn vào |
|---|---|
| `ga-gay-*` | chào buổi sáng khi mở app lần đầu trong ngày; lớp phụ của lên chuỗi ngày |
| `chim-rip-rit` | hoàn thành bài, nhận sao |
| `ech-1/2` | khoảnh khắc dễ thương của Cu Tít (không dùng cho câu sai, tránh chê trẻ) |
| `chuong-trau` | mở bong bóng, nhận quà |
| `mo-trau` | thông báo nhắc học |
| `gio-lua`, `nuoc-suoi` | nền màn chờ/chuyển cảnh, màn Văn hóa |

Chưa tìm được, vì sao:
- **Gió tre thật**: không có bản CC0 đọc được giấy phép; `gio-lua` là gió công viên thay thế.
- **Chuông/mõ trâu thật**: chưa có, hai tệp trên tự tổng hợp.
- **Sẻ riêng**: `chim-rip-rit` là chim sân sau chưa rõ loài.

### Nguồn bỏ qua
- **Freesound**: bản gốc cần đăng nhập để tải, nên bỏ, không tạo tài khoản.
- **BigSoundBank** (CC0, đã đọc giấy phép trên trang): bản tải bị Cloudflare chặn công cụ tải tự động (curl nhận trang HTML thử thách). Không tải được nên không dùng. Nếu người dùng tự tải tay thì "Rooster Song" #0283 (tác giả DenisChardonnet), "Small Bell #1" #0292 (GlaneurDeSons), "One frog" #0819, "Wind in Tall Grass" #0908 (Joseph SARDIN) là các ứng viên tốt (đều CC0).
- Nguồn có giấy phép CC BY (BudgetPixel, Commons "Rooster crowing", "Young rooster crowing" của Filo gèn, CC BY-SA 4.0): không dùng vì buộc ghi công/chia sẻ tương tự.

## Bản lai (`lai/`)

| Tệp | Công thức | Dài |
|---|---|---|
| `hoan-thanh-chim` | `hoan-thanh` + `chim-rip-rit` (0–1,4 s) trễ 0,05 s, −17 dB so với đỉnh gốc, đuôi mờ 0,25 s | 1,45 s |
| `chuoi-ngay-ga` | `chuoi-ngay` + `ga-gay-small` (lọc 6 kHz, 1,3 s) ở 0 s, −13 dB phía sau | 1,3 s |
| `chuoi-ngay-chim` | `chuoi-ngay` + `chim-rip-rit` (0,3–1,6 s) −16 dB (phương án không gáy) | 1,3 s |

Đỉnh sau trộn −1,5 dBFS. Hai bản đầu là ứng viên chính; bản `chuoi-ngay-chim` để so khi tiếng gà gáy nghe lạc.

## Nhạc nền (`nen/`)

Tự tổng hợp: ngũ cung Đô–Rê–Fa–Sol–La, nhạc cụ của v2 (T'rưng, đàn tranh/bầu gảy, mõ) + sáo trúc mới, cộng một lớp nền ruộng thật rất khẽ (CC0). Không dùng bản nhạc thật; không có cách nghe để chọn, nên chưa kèm bản CC0 nhạc dân tộc. Nếu nghe thấy đơn điệu thì tìm thêm.

Sáo trúc: `sao(f, dur)` = sin f + 0,28·sin 2f + 0,07·sin 3f; vào 45 ms, rung 5,4 Hz sâu 0,4% sau 120 ms, thêm hơi thở nhiễu thông dải 2f–6f.

| Tệp | Nhịp | Dài | kB | LUFS | Ý tưởng |
|---|---|---|---|---|---|
| `sang-lang` | 100 bpm, 28 ô | 67,2 s | 473 | −18,8 | Sáo dẫn, T'rưng rải, gảy trầm, chim khẽ. Vui, sáng |
| `chieu-dong` | 76 bpm, 24 ô | 75,8 s | 485 | −20,1 | Đàn bầu luân phiên sáo, ngân dài, gió khẽ. Chậm, êm |
| `trau-ve` | 112 bpm, 32 ô | 68,6 s | 405 | −22,1 | T'rưng nhảy, sáo ở đoạn B, mõ phách nghịch, suối. Tinh nghịch |

Cấu trúc: mỗi bản 4 ô một cụm (A, A', B, B', …, kết) rồi trở về đúng nốt đầu. Bố cục nốt nằm trong `tao-am.py` (chuỗi ô 8 ký tự).

**Vòng liền không "cụp"**: render dài hơn 2–3 s rồi gập đuôi (vang, nốt tắt) cộng lên đầu bản; nền ruộng nối vòng bằng hòa trộn công suất đều 2 s. Kiểm: bước nhảy từ mẫu cuối sang mẫu đầu so với bước mẫu trung vị là 0,03 / 0,24 / 0,97 (≤ 1 là không có cú nhảy), và sau mã hoá Opus bước lớn nhất ở biên chỉ bằng 0,45 / 0,78 / 0,56 bước lớn nhất của cả bản.

**Lưu ý phát lặp**: Opus có pre-skip nên thẻ `<audio loop>` có thể hở vài chục ms ở điểm lặp. Trong app nên giải mã sang `AudioBuffer` (Web Audio, `source.loop = true`) để liền hẳn; trang nghe thử tự làm vậy khi mở qua http(s).

## Luật dùng nhạc nền đề xuất cho app

1. **Mặc định nhỏ**: âm lượng nền tối đa ~25–30% so với âm hiệu ứng (đặt thang đầu 35% của thanh trượt, đo LUFS ≈ −19…−22 để thấp hơn giọng đọc). Không bao giờ bật khi chưa đồng ý.
2. **Công tắc riêng** trong Cài đặt (Âm thanh): "Nhạc nền" tách khỏi "Âm hiệu ứng"; thêm thanh âm lượng nền riêng. Mặc định nhạc nền **tắt ở lần mở đầu tiên** hoặc bật rất khẽ kèm hỏi một lần ở Onboarding.
3. **Tự tắt hẳn** (dừng, không chỉ hạ) khi: đang **thu âm micro** (luyện phát âm, gọi thoại, nhập giọng nói), vì micro thu lẫn nhạc sẽ làm hỏng chấm điểm A1/A2/A3 và nhận dạng; thêm 300 ms yên lặng trước khi bắt đầu thu.
4. **Hạ xuống ~20% (ducking, 0,1–0,3 s)** khi Cu Tít nói hoặc phát **TTS/đọc mẫu**, rồi trả lại sau khi xong ~0,5 s; nếu bật cả thu âm ngay sau đọc mẫu thì giữ tắt.
5. **Tắt khi gọi thoại** (suốt cuộc gọi) và khi camera AR đang thu âm.
6. **Tạm dừng khi app chạy nền hoặc màn hình tắt** (`visibilitychange`, sự kiện `pause` của Capacitor); tiếp tục khi quay lại, không phát ngầm.
7. **Tôn trọng chế độ im lặng**: nếu thiết bị ở chế độ im lặng/Không làm phiền hoặc âm lượng media = 0, không phát; trên Android dùng audio focus ngắn hạn (`AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`) và nhường khi app khác (nhạc, cuộc gọi) đang phát.
8. **Một nhạc một lúc**, chuyển bài bằng hòa trộn 1 s; chọn bài theo giờ (sáng: `sang-lang`, chiều: `chieu-dong`, màn học nhẹ: `trau-ve`) là tùy chọn, không bắt buộc.
9. Nạp lười, ~0,5 MB mỗi bài nên **không** đưa vào gói đầu của bundle; cache sau khi dùng lần đầu.

## Kiểm đã làm / chưa làm

- Đã chạy `tao-am.py` thành công; tệp đều ra ogg; số đo trong `nguon.json`; mở `nghe-thu.html` trong trình duyệt tích hợp: 28 hàng, không lỗi console.
- Chưa nghe bằng tai: chất lượng giai điệu, độ êm của lớp nền ruộng, tiếng gáy có lẫn tạp, độ hợp của hai bản lai.
- Chưa thử phát lặp bằng Web Audio trong app; chưa thử ducking với TTS thật.
