# -*- coding: utf-8 -*-
import os
import sys
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'''
        <w:tcMar {nsdecls("w")}>
            <w:top w:w="{top}" w:type="dxa"/>
            <w:bottom w:w="{bottom}" w:type="dxa"/>
            <w:left w:w="{left}" w:type="dxa"/>
            <w:right w:w="{right}" w:type="dxa"/>
        </w:tcMar>
    ''')
    tcPr.append(tcMar)

def add_callout(doc, text, title="CHÚ Ý / QUY CHUẨN KIẾN TRÚC", border_color="4F46E5", bg_color="EEF2FF"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=140, bottom=140, left=200, right=200)
    
    # Left border only
    tcPr = cell._tc.get_or_add_tcPr()
    borders = parse_xml(f'''
        <w:tcBorders {nsdecls("w")}>
            <w:left w:val="single" w:sz="36" w:space="0" w:color="{border_color}"/>
            <w:top w:val="none"/>
            <w:right w:val="none"/>
            <w:bottom w:val="none"/>
        </w:tcBorders>
    ''')
    tcPr.append(borders)
    
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(4)
    run_t = p.add_run(f"[{title}]\n")
    run_t.bold = True
    run_t.font.name = 'Calibri'
    run_t.font.size = Pt(10)
    run_t.font.color.rgb = RGBColor(0x31, 0x2E, 0x81)
    
    run_c = p.add_run(text)
    run_c.font.name = 'Calibri'
    run_c.font.size = Pt(10)
    run_c.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
    doc.add_paragraph().paragraph_format.space_after = Pt(6)

def style_heading(doc, text, level):
    h = doc.add_heading(text, level=level)
    h.paragraph_format.keep_with_next = True
    if level == 1:
        h.paragraph_format.space_before = Pt(16)
        h.paragraph_format.space_after = Pt(6)
        run = h.runs[0]
        run.font.name = 'Calibri'
        run.font.size = Pt(16)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A) # Navy Blue
    elif level == 2:
        h.paragraph_format.space_before = Pt(12)
        h.paragraph_format.space_after = Pt(4)
        run = h.runs[0]
        run.font.name = 'Calibri'
        run.font.size = Pt(13)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x25, 0x63, 0xEB) # Blue
    elif level == 3:
        h.paragraph_format.space_before = Pt(8)
        h.paragraph_format.space_after = Pt(2)
        run = h.runs[0]
        run.font.name = 'Calibri'
        run.font.size = Pt(11)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x05, 0x96, 0x69) # Emerald Green
    return h

def main():
    doc = Document()
    
    # Page setup - Margins
    for s in doc.sections:
        s.top_margin = Inches(0.8)
        s.bottom_margin = Inches(0.8)
        s.left_margin = Inches(0.8)
        s.right_margin = Inches(0.8)

    # Base Normal Style
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Calibri'
    style_normal.font.size = Pt(10.5)
    style_normal.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
    style_normal.paragraph_format.line_spacing = 1.15
    style_normal.paragraph_format.space_after = Pt(6)

    # ==================== COVER / TITLE SECTION ====================
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(24)
    title_p.paragraph_format.space_after = Pt(4)
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_sub = title_p.add_run("TRƯỜNG ĐẠI HỌC CÔNG NGHỆ THÔNG TIN - ĐHQG-HCM\nKHOA KỸ THUẬT PHẦN MỀM · BỘ MÔN CÔNG NGHỆ DI ĐỘNG\n")
    run_sub.font.size = Pt(11)
    run_sub.font.bold = True
    run_sub.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    main_title_p = doc.add_paragraph()
    main_title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    main_title_p.paragraph_format.space_before = Pt(12)
    main_title_p.paragraph_format.space_after = Pt(6)
    run_title = main_title_p.add_run("TÀI LIỆU THIẾT KẾ KIẾN TRÚC HỆ THỐNG\nVÀ ÁNH XẠ 23 MẪU THIẾT KẾ GoF")
    run_title.font.size = Pt(22)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    desc_p = doc.add_paragraph()
    desc_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    desc_p.paragraph_format.space_after = Pt(24)
    run_desc = desc_p.add_run("Đề tài: Ứng dụng & Web Hỗ trợ Người Nước Ngoài Học Tiếng Việt (Agentic Vietnamese Learning)\nLinh vật hướng dẫn: Bé Cu Tít · Kiến trúc Micro Frontend & SaaS AI Gateway")
    run_desc.font.size = Pt(12)
    run_desc.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

    # Info Box Table
    info_table = doc.add_table(rows=6, cols=2)
    info_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_info = [
        ("Môn học:", "Chuyên đề Mobile and Pervasive Computing (SE405.R11)"),
        ("Tài liệu tham chiếu:", "Báo cáo Kỹ thuật TDD v1.0 & Dự án Giao diện Stitch (ID: 8474068980628013960)"),
        ("Kiến trúc chủ đạo:", "Host Shell + 6 Micro Frontends (Module Federation) & Fastify SaaS Gateway"),
        ("Bộ mẫu thiết kế:", "Đầy đủ 23 Mẫu Thiết Kế GoF (Creational, Structural, Behavioral)"),
        ("Thời gian thực hiện:", "8 tuần (2 tháng) · 12 màn hình MVP Cam kết"),
        ("Trạng thái:", "Tài liệu kỹ thuật chính thức (Phiên bản tiếng Việt chuẩn hóa)")
    ]
    for row_idx, (k, v) in enumerate(meta_info):
        cell_k = info_table.cell(row_idx, 0)
        cell_v = info_table.cell(row_idx, 1)
        cell_k.width = Inches(2.2)
        cell_v.width = Inches(4.5)
        set_cell_background(cell_k, "F1F5F9")
        set_cell_margins(cell_k, 60, 60, 100, 100)
        set_cell_margins(cell_v, 60, 60, 100, 100)
        pk = cell_k.paragraphs[0]
        pk.add_run(k).bold = True
        pk.runs[0].font.size = Pt(10)
        pv = cell_v.paragraphs[0]
        pv.add_run(v)
        pv.runs[0].font.size = Pt(10)

    doc.add_page_break()

    # ==================== MỤC 1: TỔNG QUAN ĐỀ TÀI & TẦM NHÌN SẢN PHẨM ====================
    style_heading(doc, "1. Tổng quan Đề tài và Tầm nhìn Sản phẩm", 1)
    
    p = doc.add_paragraph()
    p.add_run("Dự án ").font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
    r_bold = p.add_run("Agentic Vietnamese Learning (Học tiếng Việt cùng Cu Tít)")
    r_bold.bold = True
    p.add_run(" là một giải pháp chuyển đổi số toàn diện hỗ trợ người nước ngoài, bao gồm các chuyên gia nước ngoài (expats), du khách và người đi làm, chinh phục rào cản tiếng Việt một cách tự nhiên, chuẩn xác và đậm đà bản sắc văn hóa bản địa.")

    style_heading(doc, "1.1 Ba rào cản cốt lõi được giải quyết", 2)
    p_barriers = doc.add_paragraph()
    p_barriers.add_run("1. ").bold = True
    p_barriers.add_run("Hệ thống 6 thanh điệu phức tạp (Ngang, Huyền, Sắc, Hỏi, Ngã, Nặng): ").bold = True
    p_barriers.add_run("Được giải quyết thông qua module Pitch Visualizer, kết hợp trích xuất cao độ F0 thời gian thực (thuật toán YIN/McLeod trên Web Worker) và so khớp contour với người bản xứ.\n")
    p_barriers.add_run("2. ").bold = True
    p_barriers.add_run("Ma trận đại từ xưng hô tôn ti tầng bậc: ").bold = True
    p_barriers.add_run("Giải quyết rào cản xưng hô (Anh, Chị, Em, Bác, Chú, Thầy, Cô, Con) bằng bộ luật suy diễn quan hệ kết hợp bối cảnh xã hội sân đình và công sở.\n")
    p_barriers.add_run("3. ").bold = True
    p_barriers.add_run("Phương ngữ đa dạng giữa 3 miền (Bắc - Trung - Nam): ").bold = True
    p_barriers.add_run("Hỗ trợ so sánh từ vựng tương đương và chuyển đổi linh hoạt giọng đọc TTS theo từng vùng miền.")

    style_heading(doc, "1.2 Ngôn ngữ thiết kế & Linh vật Bé Cu Tít (Từ dự án Stitch)", 2)
    p_stitch = doc.add_paragraph()
    p_stitch.add_run("Dựa trên dự án thiết kế Stitch (ID: 8474068980628013960), giao diện sản phẩm được định hình theo phong cách ")
    p_stitch.add_run("Agentic Minimalist kết hợp Hồn quê Dân gian Việt Nam").bold = True
    p_stitch.add_run(":\n• ")
    p_stitch.add_run("Linh vật Bé Cu Tít: ").bold = True
    p_stitch.add_run("Cậu bé làng quê 7 tuổi đội mũ lồng đèn ngôi sao, áo ba lỗ, quần chàm, túi vải đồng hành cùng người học qua các bài học, kịch bản chợ quê, quán nước gốc đa.\n• ")
    p_stitch.add_run("Bảng màu nhận diện: ").bold = True
    p_stitch.add_run("Electric Indigo (#6366F1 - Màu chủ đạo trí tuệ AI), Emerald Green (#10B981 - Đường cao độ chuẩn bản ngữ), Amber (#F59E0B - Đường phát âm của người học), Deep Slate (#0F172A - Nền trực quan âm thanh).\n• ")
    p_stitch.add_run("Typography tối ưu dấu thanh: ").bold = True
    p_stitch.add_run("Sử dụng độc quyền phông chữ Be Vietnam Pro với tỷ lệ khoảng cách dòng (line-height) được nới rộng từ 1.6x đến 1.75x, đảm bảo các tổ hợp nguyên âm và dấu thanh phức tạp (ở, ễ, ự) không bị va chạm hay mất dấu.")

    # ==================== MỤC 2: SƠ ĐỒ KIẾN TRÚC TOÀN DIỆN ====================
    style_heading(doc, "2. Sơ đồ Kiến trúc Toàn diện & Phân tích Luồng Dữ liệu", 1)
    
    p_diag_intro = doc.add_paragraph()
    p_diag_intro.add_run("Hình bên dưới mô tả toàn bộ cấu trúc kiến trúc phân tầng của hệ thống, bao gồm ranh giới giữa Client Micro Frontend, SaaS Gateway, và hệ thống nhà cung cấp đám mây bên thứ ba, cùng các vị trí áp dụng chính xác của ")
    p_diag_intro.add_run("toàn bộ 23 mẫu thiết kế GoF").bold = True
    p_diag_intro.add_run(":")

    # Insert Diagram Image
    img_file = r"c:\D\Kì cuối\Chuyên đề mobile and pervasive computing - SE405.R11\đồ án mobile\diagram_architecture_gof.png"
    if os.path.exists(img_file):
        p_img = doc.add_paragraph()
        p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.add_picture(img_file, width=Inches(6.5))
        p_caption = doc.add_paragraph()
        p_caption.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_caption.paragraph_format.space_after = Pt(12)
        r_cap = p_caption.add_run("Hình 2.1: Sơ đồ Kiến trúc Hệ thống Phân tầng và Bản đồ Tích hợp 23 Mẫu Thiết Kế GoF")
        r_cap.font.size = Pt(9.5)
        r_cap.font.italic = True
        r_cap.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    style_heading(doc, "2.1 Luồng thực thi một lượt hội thoại bằng giọng nói (Voice Turn)", 2)
    p_flow = doc.add_paragraph()
    p_flow.add_run("Hệ thống xử lý hội thoại đa phương thức thời gian thực theo 6 bước khép kín với mục tiêu độ trễ p50 ≤ 4s:\n")
    p_flow.add_run("1. Thu âm phía Client: ").bold = True
    p_flow.add_run("Người học nhấn mic. Hook useRecorder sử dụng AudioWorklet để ghi trực tiếp định dạng PCM 16kHz mono (tránh méo tiếng giữa các trình duyệt), đóng gói WAV.\n")
    p_flow.add_run("2. Gửi yêu cầu: ").bold = True
    p_flow.add_run("Client gửi audio qua POST /v1/chat/turn (kèm bearer token). SaaS Gateway xác thực, kiểm tra quota hạn mức và kích thước tệp.\n")
    p_flow.add_run("3. Nhận dạng giọng nói (STT): ").bold = True
    p_flow.add_run("Gateway chuyển tiếp audio qua SttProviderAdapter (Google Cloud STT hoặc Azure). Kết quả transcript được trả ngay về Client qua luồng Server-Sent Events (SSE) để hiển thị tức thì.\n")
    p_flow.add_run("4. Xử lý Trí tuệ Nhân tạo (LLM Streaming): ").bold = True
    p_flow.add_run("Gateway gọi mô hình ngôn ngữ lớn (Gemini 1.5 Flash / GPT-4o-mini) với prompt ngữ cảnh và persona Bé Cu Tít. LLM trả về luồng token JSON gồm văn bản trả lời, mảng sửa lỗi ngữ pháp (corrections[]), và danh sách khối UI tương tác (blocks[]).\n")
    p_flow.add_run("5. Tổng hợp Giọng nói Phát sớm (Chunked TTS): ").bold = True
    p_flow.add_run("Gateway cắt câu ngay khi có dấu chấm câu, gọi TtsProviderAdapter (Azure Neural TTS / VBEE) hoặc lấy từ bộ đệm TTS Cache, đẩy từng khối audio về Client để người học nghe ngay mà không phải chờ sinh hết câu trả lời.\n")
    p_flow.add_run("6. Hiển thị UI Động & Cập nhật Tri thức: ").bold = True
    p_flow.add_run("Client phát âm thanh, hiển thị transcript, chip sửa lỗi và dùng Agent UI Registry để dựng các thẻ tương tác. Gateway ghi nhận nhật ký phiên và cập nhật thẻ Spaced Repetition (SRS SM-2).")

    add_callout(doc, 
        "Nguyên tắc 'Client mỏng - Zero Secret Key': Trình duyệt client tuyệt đối không lưu trữ bất kỳ API Key nào của bên thứ ba (Google Cloud, Azure, OpenAI). Mọi yêu cầu đều phải đi qua SaaS Gateway để kiểm soát hạn mức, chống tấn công prompt injection và tối ưu hóa chi phí vận hành.",
        title="NGUYÊN TẮC BẢO MẬT BẮT BUỘC"
    )

    # ==================== MỤC 3: MICRO FRONTEND & AGENT UI ====================
    style_heading(doc, "3. Kiến trúc Frontend: Micro Frontend & Agent UI Protocol", 1)
    
    p_mfe = doc.add_paragraph()
    p_mfe.add_run("Hệ thống phía Client tuân thủ triệt để nguyên tắc độc lập phát triển và triển khai bằng công nghệ ")
    p_mfe.add_run("Micro Frontend (Module Federation)").bold = True
    p_mfe.add_run(", gồm 1 ứng dụng Host Shell và 6 ứng dụng con (Remotes) phân chia theo ranh giới nghiệp vụ:")

    mfe_table = doc.add_table(rows=8, cols=4)
    mfe_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ["Ứng dụng MFE", "Màn hình đảm nhiệm", "Mẫu GoF nổi bật", "Đặc tả kỹ thuật chính"]
    for i, h in enumerate(headers):
        c = mfe_table.cell(0, i)
        set_cell_background(c, "1E3A8A")
        set_cell_margins(c, 80, 80, 100, 100)
        p = c.paragraphs[0]
        p.add_run(h).bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(9.5)

    mfe_data = [
        ("host-shell", "Điều hướng, Layout, Auth, Theme, Agent UI Registry", "Singleton, Mediator, Composite, Visitor", "Không chứa nghiệp vụ học tập; quản lý Event Bus và nạp remote động."),
        ("mfe-conversation", "Chat Canvas (M1), Roleplay Simulator (M7)", "State, Prototype", "Xử lý hội thoại đa lượt, streaming audio và mô phỏng tình huống thực tế."),
        ("mfe-practice", "Adaptive Drill Cards (M5), Sentence Builder (M8)", "Factory Method, Memento", "Sinh 5 dạng bài tập thích ứng; kéo-thả token đốt tre ghép câu có Undo."),
        ("mfe-learner", "Adaptive Onboarding (M11), Analytics (M9), Preferences (M12)", "Iterator, Strategy", "Khảo sát đầu vào Elo; quản lý ôn tập Spaced Repetition (SM-2); cấu hình AI."),
        ("mfe-speech-lab", "Pitch Visualizer (M2), Dialect Switcher (M6)", "Strategy, Flyweight", "Trích xuất F0 trên Web Worker; so sánh đường contour 6 thanh điệu Bắc-Trung-Nam."),
        ("mfe-vision", "AR Camera Surface (M4 - Quán nước gốc đa)", "Bridge, Observer", "Truy cập camera qua Web API / Capacitor; nhận diện vật thể và dán nhãn từ vựng."),
        ("mfe-knowledge", "Honorific Matrix (M3), Culture Guide (M10)", "Interpreter, Flyweight", "Tra cứu ma trận đại từ xưng hô tôn ti sân đình; 20 thẻ văn hóa phong tục.")
    ]
    for row_idx, r in enumerate(mfe_data, start=1):
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(r):
            c = mfe_table.cell(row_idx, col_idx)
            set_cell_background(c, bg)
            set_cell_margins(c, 60, 60, 80, 80)
            p = c.paragraphs[0]
            p.add_run(text)
            p.runs[0].font.size = Pt(9)
            if col_idx == 0:
                p.runs[0].bold = True

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    style_heading(doc, "3.1 Giao thức UI Tương tác (Agent UI Protocol)", 2)
    p_proto = doc.add_paragraph()
    p_proto.add_run("Khác biệt lớn nhất của dự án là việc áp dụng ")
    p_proto.add_run("Agent UI Protocol").bold = True
    p_proto.add_run(". Mô hình AI không trả về chuỗi HTML nguy hiểm mà trả về cấu trúc mảng JSON đã được định kiểu chặt chẽ (tối đa 4 khối/lượt):\n")
    p_proto.add_run("• Cấu trúc AgentMessage: ").bold = True
    p_proto.add_run("{ id, role: 'agent', text, corrections[], blocks[], meta }\n")
    p_proto.add_run("• Danh mục BlockType hợp lệ: ").bold = True
    p_proto.add_run("pitch_compare (so sánh cao độ F0), drill_card (thẻ bài tập), honorific_hint (gợi ý xưng hô), dialect_compare (đối chiếu phương ngữ), sentence_frame (khung câu tre trúc), audio_clip (phát âm mẫu), quick_replies (câu trả lời nhanh).\n")
    p_proto.add_run("• Cơ chế Registry: ").bold = True
    p_proto.add_run("Host Shell dùng cơ chế phân giải động (Registry) để ánh xạ BlockType tới component lazy-load tương ứng của Remote MFE (ví dụ pitch_compare ➔ mfe-speech-lab/blocks/PitchCompare).")

    # ==================== MỤC 4: SAAS GATEWAY ====================
    style_heading(doc, "4. Kiến trúc Backend: SaaS Gateway & Bảo mật", 1)
    p_gw = doc.add_paragraph()
    p_gw.add_run("SaaS Gateway được xây dựng trên nền tảng ")
    p_gw.add_run("Node.js LTS, TypeScript và Fastify").bold = True
    p_gw.add_run(". Gateway hoạt động hoàn toàn ở chế độ không trạng thái (stateless) với ít nhất 2 instances chạy song song, sử dụng Redis và PostgreSQL để điều phối trạng thái.")

    style_heading(doc, "4.1 Pipeline xử lý yêu cầu tuần tự (Pipeline Middleware)", 2)
    p_pipe = doc.add_paragraph()
    p_pipe.add_run("Mọi yêu cầu gửi đến Gateway đều đi qua chuỗi xử lý khắt khe:\n")
    p_pipe.add_run("1. Request ID Generation: ").bold = True
    p_pipe.add_run("Tạo mã định danh duy nhất phục vụ truy vết phân tán.\n")
    p_pipe.add_run("2. Xác thực (Authentication): ").bold = True
    p_pipe.add_run("Kiểm tra tính hợp lệ của JWT token do Supabase hoặc AuthService cấp.\n")
    p_pipe.add_run("3. Kiểm soát Hạn mức (Rate Limit & Quota Check): ").bold = True
    p_pipe.add_run("Kiểm tra ngân sách người dùng trong ngày (giây STT, ký tự TTS, token LLM, số ảnh Vision). Vượt hạn mức sẽ trả về lỗi QUOTA_EXCEEDED thân thiện.\n")
    p_pipe.add_run("4. Kiểm tra Dữ liệu (Zod Schema Validation): ").bold = True
    p_pipe.add_run("Kiểm tra định dạng đầu vào và đầu ra, loại bỏ mã HTML độc hại chống XSS.\n")
    p_pipe.add_run("5. Provider Adapter Execution: ").bold = True
    p_pipe.add_run("Gọi dịch vụ AI với cơ chế timeout (1.5s), tự động thử lại (retry) và chuyển đổi sang nhà cung cấp dự phòng (fallback) nếu xảy ra lỗi.\n")
    p_pipe.add_run("6. Chuẩn hóa & Ghi nhật ký chi phí (Audit Log): ").bold = True
    p_pipe.add_run("Định dạng dữ liệu trả về và ghi nhận chi phí token/API theo từng tài khoản người học.")

    # ==================== MỤC 5: 23 MẪU GOF DESIGN PATTERNS ====================
    doc.add_page_break()
    style_heading(doc, "5. Bảng Ánh xạ Toàn diện 23 Mẫu Thiết kế GoF (Gang of Four)", 1)
    
    p_gof_intro = doc.add_paragraph()
    p_gof_intro.add_run("Để giải quyết các thách thức kỹ thuật phức tạp về độ trễ, tính module hóa, tính mở rộng và khả năng thay thế nhà cung cấp AI, toàn bộ ")
    p_gof_intro.add_run("23 mẫu thiết kế GoF chuẩn mực").bold = True
    p_gof_intro.add_run(" đã được tích hợp xuyên suốt kiến trúc hệ thống:")

    # Creational
    style_heading(doc, "5.1 Nhóm Khởi tạo (Creational Patterns - 5 mẫu)", 2)
    creat_table = doc.add_table(rows=6, cols=4)
    creat_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(["STT & Tên Mẫu", "Vị trí Cài đặt trong Code", "Bài toán Hệ thống Giải quyết", "Lợi ích Kiến trúc"]):
        c = creat_table.cell(0, i)
        set_cell_background(c, "4338CA")
        set_cell_margins(c, 80, 80, 100, 100)
        p = c.paragraphs[0]
        p.add_run(h).bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(9.5)

    creat_data = [
        ("1. Abstract Factory", "apps/gateway/src/providers/factory.ts", 
         "Khởi tạo đồng bộ một họ các bộ điều hợp AI tương thích nhau (ví dụ: họ Google Cloud STT/TTS + Gemini LLM hoặc họ Azure Speech + Azure OpenAI).", 
         "Dễ dàng chuyển đổi toàn bộ hạ tầng AI chỉ bằng cấu hình môi trường mà không sửa một dòng code nghiệp vụ."),
        ("2. Factory Method", "packages/shared/src/drills/DrillFactory.ts", 
         "Khởi tạo các đối tượng thẻ bài tập thích ứng (Trắc nghiệm, Điền từ, Nghe chọn, Ghép câu) dựa trên khóa phân loại `type` trong bài thi.", 
         "Mở rộng thêm dạng bài tập mới (ví dụ bài tập video) mà không làm ảnh hưởng đến mã nguồn của các bài tập hiện có."),
        ("3. Builder", "packages/prompts/src/PromptBuilder.ts\napps/gateway/src/builders/AgentMsgBuilder.ts", 
         "Xây dựng các prompt LLM phức tạp có cấu trúc nhiều tầng (Persona Cu Tít + CEFR Level + Kịch bản + Lịch sử lỗi) và lắp ráp đối tượng phản hồi AgentMessage.", 
         "Tách biệt quá trình xây dựng các đối tượng phức tạp khỏi biểu diễn của chúng, tránh hàm khởi tạo quá nhiều tham số."),
        ("4. Singleton", "apps/host-shell/src/bus/EventBus.ts\napps/gateway/src/db/connection.ts", 
         "Quản lý duy nhất một thực thể Event Bus phía Client và một Connection Pool kết nối cơ sở dữ liệu PostgreSQL/Redis phía Gateway.", 
         "Tránh xung đột dữ liệu sự kiện, tiết kiệm tài nguyên mạng và tối ưu bộ nhớ hệ thống."),
        ("5. Prototype", "packages/content/src/scenarios/ScenarioPrototype.ts", 
         "Nhân bản nhanh chóng các kịch bản hội thoại mẫu (Đi chợ Bến Thành, Quán nước, Hỏi đường) để tùy biến riêng cho từng học viên.", 
         "Giảm thiểu số lần truy vấn cơ sở dữ liệu đối với các cây kịch bản tĩnh có cấu trúc phức tạp.")
    ]
    for row_idx, r in enumerate(creat_data, start=1):
        bg = "EEF2FF" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(r):
            c = creat_table.cell(row_idx, col_idx)
            set_cell_background(c, bg)
            set_cell_margins(c, 60, 60, 80, 80)
            p = c.paragraphs[0]
            p.add_run(text)
            p.runs[0].font.size = Pt(8.5)
            if col_idx == 0:
                p.runs[0].bold = True

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # Structural
    style_heading(doc, "5.2 Nhóm Cấu trúc (Structural Patterns - 7 mẫu)", 2)
    struct_table = doc.add_table(rows=8, cols=4)
    struct_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(["STT & Tên Mẫu", "Vị trí Cài đặt trong Code", "Bài toán Hệ thống Giải quyết", "Lợi ích Kiến trúc"]):
        c = struct_table.cell(0, i)
        set_cell_background(c, "059669")
        set_cell_margins(c, 80, 80, 100, 100)
        p = c.paragraphs[0]
        p.add_run(h).bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(9.5)

    struct_data = [
        ("6. Adapter", "apps/gateway/src/adapters/ (SttAdapter, TtsAdapter)", 
         "Chuẩn hóa các API bên ngoài có giao diện khác nhau (Azure Speech, Google Cloud, VBEE, ElevenLabs) về chung giao diện SttProvider và TtsProvider.", 
         "Thay đổi hoặc bổ sung nhà cung cấp AI mà không phải chỉnh sửa mã nguồn của Client hay Gateway Handler."),
        ("7. Facade", "apps/gateway/src/routes/chat.ts\npackages/audio-dsp/src/AudioDSPFacade.ts", 
         "Gom chuỗi quy trình phức tạp gồm thu âm, STT, LLM Streaming, chấm phát âm và TTS thành một endpoint duy nhất `/v1/chat/turn`.", 
         "Giảm tải tối đa sự phụ thuộc cho Client; Client chỉ gọi một hàm duy nhất để hoàn thành một lượt hội thoại trọn vẹn."),
        ("8. Composite", "apps/host-shell/src/components/AgentUI/BlockTree.tsx", 
         "Mô hình hóa các khối giao diện UI động thành cấu trúc cây phân cấp (Một Card Block có thể chứa Audio Clip, Quick Replies và Pitch Compare).", 
         "Cho phép xử lý một khối UI đơn lẻ hay một nhóm các khối UI lồng nhau một cách đồng nhất và dễ mở rộng."),
        ("9. Decorator", "apps/gateway/src/middleware/ (Quota, Auth, Log)", 
         "Bọc các bộ xử lý yêu cầu (Route Handlers) để bổ sung thêm chức năng kiểm tra token, kiểm soát hạn mức quota, và tính toán chi phí API.", 
         "Bổ sung hành vi mới linh hoạt cho các endpoint mà không làm thay đổi logic nghiệp vụ bên trong."),
        ("10. Bridge", "packages/audio-dsp/src/audio/AudioCaptureBridge.ts", 
         "Tách biệt tầng trừu tượng thu âm và xử lý âm thanh khỏi tầng hiện thực trên các nền tảng khác nhau (Web Audio API trên trình duyệt vs Capacitor Native Plugin).", 
         "Duy trì một codebase thống nhất, cho phép ứng dụng chạy mượt mà cả trên web responsive và ứng dụng di động native."),
        ("11. Proxy", "apps/gateway/src/cache/TTSCacheProxy.ts", 
         "Tạo lớp ủy nhiệm trung gian kiểm tra xem đoạn âm thanh cần phát đã tồn tại trong bộ nhớ đệm S3 (băm từ văn bản + giọng đọc + tốc độ) hay chưa trước khi gọi API.", 
         "Tiết kiệm chi phí gọi API tổng hợp giọng nói lên đến 60% và giảm độ trễ phản hồi xuống dưới 200ms cho các câu mẫu."),
        ("12. Flyweight", "packages/content/src/pitch/PitchReferenceFlyweight.ts", 
         "Chia sẻ các mẫu contour âm thanh chuẩn của 6 thanh điệu tiếng Việt và các thẻ văn hóa tĩnh dùng chung giữa hàng ngàn phiên học viên.", 
         "Tối ưu hóa bộ nhớ RAM của Client và Server, ngăn chặn việc nhân bản vô hạn các cấu trúc dữ liệu tĩnh lớn.")
    ]
    for row_idx, r in enumerate(struct_data, start=1):
        bg = "ECFDF5" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(r):
            c = struct_table.cell(row_idx, col_idx)
            set_cell_background(c, bg)
            set_cell_margins(c, 60, 60, 80, 80)
            p = c.paragraphs[0]
            p.add_run(text)
            p.runs[0].font.size = Pt(8.5)
            if col_idx == 0:
                p.runs[0].bold = True

    doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # Behavioral
    style_heading(doc, "5.3 Nhóm Hành vi (Behavioral Patterns - 11 mẫu)", 2)
    behav_table = doc.add_table(rows=12, cols=4)
    behav_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(["STT & Tên Mẫu", "Vị trí Cài đặt trong Code", "Bài toán Hệ thống Giải quyết", "Lợi ích Kiến trúc"]):
        c = behav_table.cell(0, i)
        set_cell_background(c, "B45309")
        set_cell_margins(c, 80, 80, 100, 100)
        p = c.paragraphs[0]
        p.add_run(h).bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(9.5)

    behav_data = [
        ("13. Strategy", "packages/audio-dsp/src/pitch/PitchStrategy.ts", 
         "Cho phép hoán đổi thuật toán trích xuất F0 giữa YIN (độ chính xác cao) và McLeod (tốc độ cao) dựa trên hiệu năng thiết bị của học viên.", 
         "Đảm bảo ứng dụng chạy mượt mà ngay cả trên các thiết bị di động có cấu hình yếu mà không làm gián đoạn trải nghiệm."),
        ("14. Observer", "apps/host-shell/src/bus/EventBus.ts\napps/mfe-speech-lab/src/AudioObserver.ts", 
         "Đăng ký và phát tín hiệu cho các sự kiện dùng chung (session.started, attempt.completed) và phát sóng đường pitch theo thời gian thực tới Canvas.", 
         "Giải phóng liên kết trực tiếp giữa các Remote MFE; các component UI tự động cập nhật khi trạng thái âm thanh thay đổi."),
        ("15. Chain of Resp.", "apps/gateway/src/pipeline/RequestPipeline.ts\napps/gateway/src/services/grammar/CheckChain.ts", 
         "Chuỗi xử lý yêu cầu tại Gateway và chuỗi kiểm tra ngữ pháp A8 (So khớp từ điển ➔ Bộ luật cấu trúc câu ➔ Phân tích ngữ nghĩa bằng LLM).", 
         "Tăng tính module hóa, dễ dàng ngắt chuỗi sớm (Early Exit) khi phát hiện lỗi hoặc từ điển đã xác thực xong mà không cần gọi LLM tốn kém."),
        ("16. Command", "apps/host-shell/src/commands/UIBlockCommand.ts", 
         "Đóng gói mọi hành vi tương tác trên UI Block (click trả lời, nghe lại audio, mở modal tra cứu) thành các đối tượng lệnh độc lập.", 
         "Dễ dàng ghi nhận lịch sử học tập, hỗ trợ cơ chế thử lại (Retry) khi rớt mạng và đồng bộ dữ liệu ngoại tuyến."),
        ("17. State", "apps/mfe-conversation/src/state/TurnStateMachine.ts", 
         "Quản lý vòng đời trạng thái của một lượt hội thoại: IDLE ➔ RECORDING ➔ UPLOADING ➔ STREAMING_RESPONSE ➔ PLAYING ➔ FINISHED.", 
         "Ngăn chặn triệt để tình trạng click trùng lặp, lỗi xung đột tài nguyên micro, và bảo đảm tính toàn vẹn trạng thái ứng dụng."),
        ("18. Template Method", "apps/gateway/src/services/assessment/PronounceAssessment.ts", 
         "Định nghĩa khung thuật toán chấm điểm phát âm A3 cố định: (1) Chuẩn hóa Unicode NFC ➔ (2) So khớp chuỗi ký tự ➔ (3) Phân tích đường contour A2 ➔ (4) Tổng hợp điểm số.", 
         "Cố định các bước nghiệp vụ chấm thi cốt lõi trong khi cho phép các lớp con tùy biến chi tiết cách so khớp của từng giọng địa phương."),
        ("19. Mediator", "apps/host-shell/src/mediator/ShellMediator.ts", 
         "Host Shell đóng vai trò là trọng tài trung gian điều phối luồng dữ liệu và chuyển màn hình giữa 6 Remote Micro Frontend.", 
         "Triệt tiêu hoàn toàn sự phụ thuộc chéo giữa các remote (Remote A không bao giờ được phép import trực tiếp từ Remote B)."),
        ("20. Iterator", "packages/shared/src/srs/SRSIterator.ts", 
         "Cung cấp cách thức duyệt qua danh sách các thẻ từ vựng và câu cần ôn tập theo thuật toán ngắt quãng SM-2 mà không để lộ cấu trúc bảng dữ liệu.", 
         "Hỗ trợ phân trang, lọc theo chủ đề và duyệt thẻ mượt mà cho các màn hình ôn tập Vườn cây tri thức."),
        ("21. Interpreter", "packages/content/src/honorifics/HonorificInterpreter.ts", 
         "Phân tích và diễn giải biểu thức quy tắc đại từ nhân xưng (Tuổi, Giới tính, Thứ bậc gia đình, Bối cảnh trang trọng) ra cặp đại từ chuẩn xác.", 
         "Giúp bộ luật xưng hô tiếng Việt có thể mở rộng biểu thức điều kiện linh hoạt như một ngôn ngữ cấu hình nội bộ."),
        ("22. Visitor", "apps/host-shell/src/protocol/BlockVisitor.ts", 
         "Duyệt qua cây cấu trúc UI Block để thực hiện các thao tác riêng biệt: BlockSanitizerVisitor (loại bỏ mã độc XSS) và BlockAnalyticsVisitor (thống kê lượt xem).", 
         "Thêm mới các chức năng phân tích hoặc bảo mật trên khối UI mà không cần can thiệp hay sửa đổi định dạng của từng loại Block."),
        ("23. Memento", "apps/mfe-practice/src/sentence/SentenceBuilderMemento.ts", 
         "Lưu lại các ảnh chụp trạng thái (Snapshot) vị trí kéo thả các đốt tre từ ngữ trong màn hình Sentence Builder.", 
         "Cung cấp tính năng Undo / Redo cho học viên khi sắp xếp sai trật tự từ mà không phá vỡ tính bao đóng của dữ liệu.")
    ]
    for row_idx, r in enumerate(behav_data, start=1):
        bg = "FFFBEB" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(r):
            c = behav_table.cell(row_idx, col_idx)
            set_cell_background(c, bg)
            set_cell_margins(c, 60, 60, 80, 80)
            p = c.paragraphs[0]
            p.add_run(text)
            p.runs[0].font.size = Pt(8.5)
            if col_idx == 0:
                p.runs[0].bold = True

    # ==================== MỤC 6: 8 THUẬT TOÁN TỰ VIẾT ====================
    doc.add_page_break()
    style_heading(doc, "6. Danh mục 8 Thuật toán Tự viết Chuyên biệt (A1 – A8)", 1)
    
    p_alg = doc.add_paragraph()
    p_alg.add_run("Do các nhà cung cấp đám mây quốc tế chưa hỗ trợ đầy đủ các tính năng đặc thù của tiếng Việt (đặc biệt là chấm thanh điệu và đại từ nhân xưng), dự án đã tự thiết kế và hiện thực ")
    p_alg.add_run("8 thuật toán cốt lõi đóng gói riêng").bold = True
    p_alg.add_run(":")

    alg_table = doc.add_table(rows=9, cols=5)
    alg_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(["Mã", "Tên Thuật toán", "Đầu vào ➔ Đầu ra", "Môi trường Chạy", "Đặc tả Kỹ thuật"]):
        c = alg_table.cell(0, i)
        set_cell_background(c, "1E3A8A")
        set_cell_margins(c, 80, 80, 100, 100)
        p = c.paragraphs[0]
        p.add_run(h).bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(9.5)

    alg_data = [
        ("A1", "Trích xuất cao độ F0 & Chuẩn hóa", "PCM 16 kHz ➔ Contour Semitone", "Client (Web Worker) & Node.js", "Sử dụng giải thuật YIN/McLeod, lọc trung vị khử nhiễu, sửa lỗi nhảy quãng tám, quy đổi F0 về thang đo Semitone so với cao độ trung bình của người học."),
        ("A2", "So sánh Contour & Phân loại thanh", "2 đường Contour ➔ Điểm tương đồng 0-100", "Client (packages/audio-dsp)", "Áp dụng thuật toán Dynamic Time Warping (DTW) và hệ số tương quan Pearson; dùng bộ luật độ dốc và cực trị để phân loại chính xác 6 thanh tiếng Việt."),
        ("A3", "Chấm phát âm tổng hợp", "Transcript + Câu mẫu ➔ Điểm & Gợi ý sửa lỗi", "Gateway SaaS", "Chuẩn hóa chuỗi bằng Unicode NFC, tính sai khác ký tự kết hợp trọng số từ thuật toán A2 để đưa ra điểm số phát âm và danh sách từ cần uốn nắn."),
        ("A4", "Lặp lại ngắt quãng (SM-2)", "Đánh giá chất lượng 0-5 ➔ Khoảng cách ngày ôn", "Shared package (Client + Server)", "Tính toán chu kỳ ôn tập tối ưu cho từ vựng và câu dựa trên độ bền ghi nhớ của não bộ, tự động tăng/giảm hệ số dễ (Ease Factor)."),
        ("A5", "Kiểm tra trình độ đầu vào thích ứng", "Chuỗi câu trả lời ➔ Câu hỏi kế tiếp, Level 1-6", "Gateway SaaS", "Thuật toán dạng Staircase / Elo thích ứng: làm đúng câu hỏi tăng độ khó, làm sai hạ độ khó; hội tụ xác định trình độ CEFR sau 8-12 câu hỏi."),
        ("A6", "Bộ luật đại từ xưng hô", "Tuổi, Giới tính, Quan hệ ➔ Cặp đại từ + Ví dụ", "Client + JSON Nội dung", "Bảng tra cứu và suy diễn quan hệ gia đình (ông, bà, chú, bác) và xã hội (anh, chị, em, thầy, bạn) với 20 cặp quan hệ điển hình trong giao tiếp Việt."),
        ("A7", "Ánh xạ từ vựng phương ngữ", "Từ chuẩn, Miền ➔ Từ tương đương + Audio", "JSON Nội dung + Gateway", "Bảng tra cứu từ vựng đối sánh Bắc - Trung - Nam (ví dụ: ngô ➔ bắp, muỗng ➔ thìa), kích hoạt đúng giọng đọc TTS vùng miền tương ứng."),
        ("A8", "Kiểm tra trật tự câu tiếng Việt", "Mảng Token từ ➔ Hợp lệ / Sai vị trí / Gợi ý", "Gateway SaaS", "So khớp mảng token với không gian lời giải chấp nhận được (Acceptance Set); nếu nằm ngoài tập sẽ tự động chuyển tiếp tới LLM để giải thích ngữ pháp.")
    ]
    for row_idx, r in enumerate(alg_data, start=1):
        bg = "F1F5F9" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(r):
            c = alg_table.cell(row_idx, col_idx)
            set_cell_background(c, bg)
            set_cell_margins(c, 60, 60, 80, 80)
            p = c.paragraphs[0]
            p.add_run(text)
            p.runs[0].font.size = Pt(8.5)
            if col_idx == 0:
                p.runs[0].bold = True

    # ==================== MỤC 7: 12 MÀN HÌNH MVP ====================
    doc.add_page_break()
    style_heading(doc, "7. Đặc tả 12 Màn hình MVP từ Bản Thiết kế Stitch", 1)
    
    p_screen = doc.add_paragraph()
    p_screen.add_run("Dự án cam kết hoàn thành đầy đủ ")
    p_screen.add_run("12 màn hình MVP").bold = True
    p_screen.add_run(" được nhóm thành 6 ứng dụng Micro Frontend, phân tách rõ ràng giữa mức Cam kết (bắt buộc hoàn thành) và mức Mở rộng:")

    scr_table = doc.add_table(rows=13, cols=4)
    scr_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(["STT & Tên Màn Hình", "Remote MFE", "Mức Cam Kết (Bắt buộc)", "Mức Mở Rộng (Tùy chọn)"]):
        c = scr_table.cell(0, i)
        set_cell_background(c, "1E3A8A")
        set_cell_margins(c, 80, 80, 100, 100)
        p = c.paragraphs[0]
        p.add_run(h).bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(9.5)

    scr_data = [
        ("M1. Chat Canvas", "mfe-conversation", "Nhập text & nói; multi-turn ngữ cảnh N lượt; streaming SSE; chip sửa lỗi; render ≥ 4 loại khối UI qua Agent UI Protocol.", "Tóm tắt phiên học; sửa lỗi ngữ pháp inline; tìm kiếm lịch sử."),
        ("M2. Pitch Visualizer", "mfe-speech-lab", "Thu âm, vẽ đè 2 đường contour người học và người mẫu cho 6 thanh và 20 từ/cụm; nghe mẫu; điểm tương đồng gợi ý.", "30 từ/cụm; tự động phát hiện thanh người học bị lệch; phản hồi bằng lời."),
        ("M3. Honorific Matrix", "mfe-knowledge", "Chọn tuổi / giới tính / quan hệ / mức trang trọng ➔ Cặp đại từ + ví dụ minh họa + âm thanh đọc mẫu; 20 cặp quan hệ.", "30 cặp quan hệ; minigame trắc nghiệm nhanh; LLM giải thích ngữ cảnh tình huống."),
        ("M4. AR Camera Surface", "mfe-vision", "Mở camera, chụp khung cảnh (Quán nước gốc đa) ➔ gửi vision ➔ dán nhãn từ vựng tiếng Việt lên đồ vật, nghe đọc và lưu vào SRS.", "Overlay liên tục theo thời gian thực (tracking vật thể 3D)."),
        ("M5. Adaptive Drill Cards", "mfe-practice", "5 dạng bài tập (trắc nghiệm, điền từ, nghe chọn, sắp xếp, đọc lại) sinh theo level bằng LLM có Zod schema; chấm xác định + rubric.", "Tự động điều chỉnh độ khó bài tập theo lịch sử thời gian thực."),
        ("M6. Dialect Switcher", "mfe-speech-lab", "So sánh đối chiếu Bắc / Trung / Nam cho 30 từ/cụm; nghe phát âm theo từng miền (Chuyến tàu xuyên Việt).", "40 từ/cụm; tính năng chuyển đổi toàn bộ cuộc hội thoại sang giọng vùng miền."),
        ("M7. Roleplay Simulator", "mfe-conversation", "4 kịch bản nhập vai (Đi chợ quê trả giá, Hỏi đường, Quán phở, Làm quen) có nhiệm vụ mục tiêu và tổng kết lỗi cuối phiên.", "6 kịch bản (bổ sung Taxi, Khách sạn); chấm điểm hoàn thành nhiệm vụ."),
        ("M8. Sentence Builder", "mfe-practice", "Kéo-thả token đốt tre trúc, kiểm tra tính hợp lệ và giải thích lỗi trật tự từ; 60 câu có ngân hàng đáp án chuẩn.", "100 câu; LLM tự động sinh cấu trúc câu mới theo chủ đề."),
        ("M9. Analytics & SRS", "mfe-learner", "Theo dõi Streak, thời lượng học, độ chính xác từng kỹ năng, số thẻ từ vựng đến hạn ôn tập SM-2 đồng bộ máy chủ.", "Dự báo tiến độ đạt chứng chỉ CEFR; hỗ trợ chế độ ôn tập ngoại tuyến (Offline)."),
        ("M10. Culture Guide", "mfe-knowledge", "20 thẻ phong tục tập quán, kiêng kỵ dân gian; tính năng hỏi đáp cùng AI chỉ dựa trên dữ liệu các thẻ đã được xác thực.", "25 thẻ; gợi ý thẻ văn hóa tự động theo ngữ cảnh của phòng Roleplay."),
        ("M11. Adaptive Onboarding", "mfe-learner", "Khảo sát mục tiêu, tiếng mẹ đẻ, phương ngữ mong muốn; bài kiểm tra thích ứng 8-12 câu ➔ xếp lớp 1-6 và lộ trình.", "Đánh giá chi tiết phát âm ngay trong bài kiểm tra đầu vào."),
        ("M12. AI Preferences", "mfe-learner", "Tùy biến giọng đọc Bắc/Trung/Nam, tốc độ nói, mức độ sửa lỗi khắt khe, đổi persona AI và ngôn ngữ giải thích.", "Tự động học hành vi của người dùng để cá nhân hóa tham số.")
    ]
    for row_idx, r in enumerate(scr_data, start=1):
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(r):
            c = scr_table.cell(row_idx, col_idx)
            set_cell_background(c, bg)
            set_cell_margins(c, 60, 60, 80, 80)
            p = c.paragraphs[0]
            p.add_run(text)
            p.runs[0].font.size = Pt(8.5)
            if col_idx == 0:
                p.runs[0].bold = True

    # ==================== MỤC 8: QUY CHUẨN VẬN HÀNH & DOD ====================
    doc.add_page_break()
    style_heading(doc, "8. Quy chuẩn Vận hành, Bảo mật & Định nghĩa Hoàn thành (DoD)", 1)
    
    style_heading(doc, "8.1 Tiêu chuẩn Định dạng Âm thanh và Văn bản Tiếng Việt", 2)
    p_spec = doc.add_paragraph()
    p_spec.add_run("• Quy chuẩn Âm thanh: ").bold = True
    p_spec.add_run("Tần số lấy mẫu cố định ở mức 16,000 Hz, kênh đơn (mono), 16-bit PCM uncompressed. Sử dụng Web Worker để tính toán F0, tuyệt đối không chặn Main Thread của trình duyệt.\n• ")
    p_spec.add_run("Chuẩn hóa Văn bản Tiếng Việt: ").bold = True
    p_spec.add_run("Mọi chuỗi tiếng Việt lưu trữ hoặc so khớp bắt buộc phải đưa về định dạng ")
    p_spec.add_run("Unicode Normalization Form C (NFC)").bold = True
    p_spec.add_run(". Từ chối các chuỗi ký tự dạng NFD (dấu tách rời) để ngăn chặn lỗi so khớp sai biệt dấu thanh.\n• ")
    p_spec.add_run("Bảo vệ Dữ liệu Cá nhân Giọng nói: ").bold = True
    p_spec.add_run("File âm thanh ghi âm của học viên được gắn thời gian hết hạn (TTL tối đa 30 ngày) và có tùy chọn xóa theo yêu cầu của người dùng.")

    style_heading(doc, "8.2 Định nghĩa Hoàn thành (Definition of Done - DoD)", 2)
    p_dod = doc.add_paragraph()
    p_dod.add_run("Một tính năng hoặc màn hình chỉ được coi là hoàn tất khi thỏa mãn 6 tiêu chí:\n")
    p_dod.add_run("1. Tuân thủ Contract: ").bold = True
    p_dod.add_run("Có schema Zod / OpenAPI đầy đủ và vượt qua các bài kiểm thử Mock Server.\n")
    p_dod.add_run("2. Độ bao phủ Kiểm thử: ").bold = True
    p_dod.add_run("Có Unit Test cho logic nghiệp vụ cốt lõi; kịch bản E2E Smoke Test chạy thành công trên CI Pipeline.\n")
    p_dod.add_run("3. Đa nền tảng thực tế: ").bold = True
    p_dod.add_run("Chạy mượt mà trên Chrome, Safari iOS và Android thật đối với các tính năng sử dụng Micro và Camera.\n")
    p_dod.add_run("4. Xử lý Trạng thái Ngoại lệ: ").bold = True
    p_dod.add_run("Có đầy đủ trạng thái Loading, Lỗi, và Rỗng. Hiển thị thông báo thân thiện khi hệ thống vượt quá hạn mức QUOTA_EXCEEDED.\n")
    p_dod.add_run("5. Thẩm định Nội dung Bản địa: ").bold = True
    p_dod.add_run("Nội dung bài tập, văn hóa và phương ngữ phải được người bản ngữ trong đội ngũ phê duyệt (reviewed_by).\n")
    p_dod.add_run("6. An toàn & Bảo mật: ").bold = True
    p_dod.add_run("Không để lộ API Key phía Client; vượt qua vòng rà soát mã nguồn (Code Review) của Lead Developer.")

    # Save document
    output_docx_path = r"c:\D\Kì cuối\Chuyên đề mobile and pervasive computing - SE405.R11\đồ án mobile\Tai_Lieu_Thiet_Ke_Kien_Truc_He_Thong_Va_Design_Patterns.docx"
    v2_path = r"c:\D\Kì cuối\Chuyên đề mobile and pervasive computing - SE405.R11\đồ án mobile\Tai_Lieu_Thiet_Ke_Kien_Truc_He_Thong_Va_Design_Patterns_v2.docx"
    try:
        doc.save(output_docx_path)
        print("SUCCESS_DOCX_OVERWRITTEN")
    except PermissionError:
        doc.save(v2_path)
        print("SUCCESS_SAVED_AS_V2_LOCKED")

if __name__ == '__main__':
    main()
