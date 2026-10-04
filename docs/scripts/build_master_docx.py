# -*- coding: utf-8 -*-
import os
import sys
import docx
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=80, bottom=80, left=120, right=120):
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

def add_callout(doc, text, title="QUY CHUẨN KỸ THUẬT (ASD-STE100)", border_color="4F46E5", bg_color="EEF2FF"):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, bg_color)
    set_cell_margins(cell, top=120, bottom=120, left=160, right=160)
    
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
    run_c.font.size = Pt(9.5)
    run_c.font.color.rgb = RGBColor(0x1F, 0x29, 0x37)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def style_heading(doc, text, level):
    h = doc.add_heading(text, level=level)
    h.paragraph_format.keep_with_next = True
    if level == 1:
        h.paragraph_format.space_before = Pt(16)
        h.paragraph_format.space_after = Pt(6)
        run = h.runs[0]
        run.font.name = 'Calibri'
        run.font.size = Pt(15)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A) # Navy Blue
    elif level == 2:
        h.paragraph_format.space_before = Pt(12)
        h.paragraph_format.space_after = Pt(4)
        run = h.runs[0]
        run.font.name = 'Calibri'
        run.font.size = Pt(12.5)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x25, 0x63, 0xEB) # Blue
    elif level == 3:
        h.paragraph_format.space_before = Pt(8)
        h.paragraph_format.space_after = Pt(2)
        run = h.runs[0]
        run.font.name = 'Calibri'
        run.font.size = Pt(10.5)
        run.font.bold = True
        run.font.color.rgb = RGBColor(0x05, 0x96, 0x69) # Emerald Green
    return h

def add_code_block(doc, code_text):
    tbl = doc.add_table(rows=1, cols=1)
    tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell = tbl.cell(0, 0)
    set_cell_background(cell, "0F172A") # Slate Dark
    set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
    p = cell.paragraphs[0]
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(code_text)
    run.font.name = 'Consolas'
    run.font.size = Pt(8.5)
    run.font.color.rgb = RGBColor(0x38, 0xBD, 0xF8) # Sky blue
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

def build_master_doc():
    doc = Document()
    
    # Page setup - Margins 0.8 inch
    for s in doc.sections:
        s.top_margin = Inches(0.8)
        s.bottom_margin = Inches(0.8)
        s.left_margin = Inches(0.8)
        s.right_margin = Inches(0.8)

    # Base Normal Style
    style_normal = doc.styles['Normal']
    style_normal.font.name = 'Calibri'
    style_normal.font.size = Pt(10)
    style_normal.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
    style_normal.paragraph_format.line_spacing = 1.15
    style_normal.paragraph_format.space_after = Pt(5)

    # ==================== TRANG BÌA (COVER SECTION) ====================
    title_p = doc.add_paragraph()
    title_p.paragraph_format.space_before = Pt(18)
    title_p.paragraph_format.space_after = Pt(4)
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_sub = title_p.add_run("TRƯỜNG ĐẠI HỌC CÔNG NGHỆ THÔNG TIN - ĐHQG-HCM\nKHOA KỸ THUẬT PHẦN MỀM · BỘ MÔN CÔNG NGHỆ DI ĐỘNG\n")
    run_sub.font.size = Pt(11)
    run_sub.font.bold = True
    run_sub.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    main_title_p = doc.add_paragraph()
    main_title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    main_title_p.paragraph_format.space_before = Pt(8)
    main_title_p.paragraph_format.space_after = Pt(6)
    run_title = main_title_p.add_run("SỔ TAY KỸ THUẬT TOÀN DIỆN:\nTECH STACK, KIẾN TRÚC & 23 MẪU GoF")
    run_title.font.size = Pt(20)
    run_title.font.bold = True
    run_title.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    desc_p = doc.add_paragraph()
    desc_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    desc_p.paragraph_format.space_after = Pt(18)
    run_desc = desc_p.add_run("Đề tài: Nền tảng Học Tiếng Việt Thông Minh (Agentic Vietnamese Learning - Bé Cu Tít)\nBiên soạn theo nguyên tắc ASD-STE100 Tiếng Việt (Câu ngắn, trực tiếp, có liên kết tài liệu chính thức)")
    run_desc.font.size = Pt(11)
    run_desc.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

    # Meta Table
    info_table = doc.add_table(rows=6, cols=2)
    info_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    meta_info = [
        ("Môn học:", "Chuyên đề Mobile and Pervasive Computing (SE405.R11)"),
        ("Tài liệu tham chiếu:", "Báo cáo Kỹ thuật TDD v1.0 & Bản thiết kế Stitch (ID: 8474068980628013960)"),
        ("Phạm vi tài liệu:", "Toàn bộ Tech Stack (AI, Database, Frontend, Gateway, Testing, Tooling, Cloud)"),
        ("Số lượng Mẫu GoF:", "Đầy đủ 23/23 Mẫu Thiết Kế GoF (Creational, Structural, Behavioral)"),
        ("Định dạng chuẩn văn bản:", "ASD-STE100 tiếng Việt: Trực tiếp, câu ngắn dưới 25 từ, có bảng tham chiếu"),
        ("Mục tiêu sử dụng:", "Bàn giao đội ngũ lập trình (M1 - M5) cài đặt đúng các thư viện và cấu hình chuẩn")
    ]
    for row_idx, (k, v) in enumerate(meta_info):
        ck = info_table.cell(row_idx, 0)
        cv = info_table.cell(row_idx, 1)
        ck.width = Inches(2.2)
        cv.width = Inches(4.5)
        set_cell_background(ck, "F1F5F9")
        set_cell_margins(ck, 50, 50, 80, 80)
        set_cell_margins(cv, 50, 50, 80, 80)
        pk = ck.paragraphs[0]
        pk.add_run(k).bold = True
        pk.runs[0].font.size = Pt(9.5)
        pv = cv.paragraphs[0]
        pv.add_run(v)
        pv.runs[0].font.size = Pt(9.5)

    doc.add_page_break()

    # ==================== MỤC 1: TỔNG QUAN ĐỀ TÀI ====================
    style_heading(doc, "1. Tổng quan Đề tài & Triết lý Thiết kế (ASD-STE100)", 1)
    
    p = doc.add_paragraph()
    p.add_run("Dự án xây dựng nền tảng học tiếng Việt tương tác cao dành cho người nước ngoài. Hệ thống giải quyết ba rào cản ngôn ngữ cốt lõi:\n")
    p.add_run("1. Sáu thanh điệu tiếng Việt: ").bold = True
    p.add_run("Học viên luyện phát âm qua đường cong cao độ F0 thời gian thực.\n")
    p.add_run("2. Đại từ xưng hô tôn ti: ").bold = True
    p.add_run("Hệ thống suy diễn cặp đại từ chuẩn xác theo tuổi, giới tính và quan hệ xã hội.\n")
    p.add_run("3. Phương ngữ ba miền: ").bold = True
    p.add_run("Ứng dụng đối chiếu từ vựng và phát âm giữa giọng Bắc, Trung và Nam.")

    style_heading(doc, "1.1 Linh vật Bé Cu Tít & Thiết kế Stitch", 2)
    p2 = doc.add_paragraph()
    p2.add_run("Dự án áp dụng ngôn ngữ thiết kế từ Stitch (ID: 8474068980628013960). Phong cách kết hợp giữa tính tối giản thông minh (Agentic Minimalist) và văn hóa làng quê Việt Nam.\n")
    p2.add_run("• Linh vật Bé Cu Tít: ").bold = True
    p2.add_run("Cậu bé 7 tuổi đội mũ lồng đèn ngôi sao, mặc áo ba lỗ, mang túi vải mộc mạc.\n")
    p2.add_run("• Bảng màu chủ đạo: ").bold = True
    p2.add_run("Electric Indigo (#6366F1), Emerald Green (#10B981), Amber (#F59E0B), Deep Slate (#0F172A).\n")
    p2.add_run("• Phông chữ tối ưu dấu thanh: ").bold = True
    p2.add_run("Dự án sử dụng phông chữ Be Vietnam Pro với tỷ lệ giãn dòng 1.6x đến 1.75x để hiển thị rõ ràng các nguyên âm có dấu (ở, ễ, ự).")

    # ==================== MỤC 2: SƠ ĐỒ KIẾN TRÚC TỔNG THỂ ====================
    style_heading(doc, "2. Sơ đồ Kiến trúc Tổng thể & Phân tích Luồng Dữ liệu", 1)
    
    p_diag = doc.add_paragraph()
    p_diag.add_run("Hình 2.1 mô tả kiến trúc phân tầng hoàn chỉnh của hệ thống. Sơ đồ thể hiện rõ ranh giới giữa Client Micro Frontend, SaaS Gateway, và các dịch vụ đám mây bên thứ ba:")

    # Insert verified clean diagram
    img_file = r"c:\D\Kì cuối\Chuyên đề mobile and pervasive computing - SE405.R11\đồ án mobile\diagram_architecture_gof.png"
    if os.path.exists(img_file):
        p_img = doc.add_paragraph()
        p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.add_picture(img_file, width=Inches(6.5))
        p_cap = doc.add_paragraph()
        p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_cap.paragraph_format.space_after = Pt(10)
        rc = p_cap.add_run("Hình 2.1: Sơ đồ Kiến trúc Hệ thống Phân tầng và Bản đồ Tích hợp 23 Mẫu Thiết Kế GoF")
        rc.font.size = Pt(9)
        rc.font.italic = True
        rc.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    style_heading(doc, "2.1 Chu trình một lượt hội thoại giọng nói (Voice Turn)", 2)
    p_vt = doc.add_paragraph()
    p_vt.add_run("Chu trình xử lý giọng nói diễn ra qua 6 bước tuần tự với mục tiêu độ trễ p50 ≤ 4.0 giây:\n")
    p_vt.add_run("1. Thu âm Client: ").bold = True
    p_vt.add_run("Client ghi âm định dạng PCM 16kHz mono qua AudioWorklet và đóng gói WAV.\n")
    p_vt.add_run("2. Gửi yêu cầu: ").bold = True
    p_vt.add_run("Client gửi gói tin tới POST /v1/chat/turn kèm mã định danh phiên.\n")
    p_vt.add_run("3. Nhận dạng STT: ").bold = True
    p_vt.add_run("Gateway gọi STT Provider. Gateway đẩy transcript về Client qua Server-Sent Events (SSE).\n")
    p_vt.add_run("4. Xử lý LLM: ").bold = True
    p_vt.add_run("Gateway gọi LLM Streaming. LLM trả về luồng token gồm văn bản, sửa lỗi và khối Agent UI Blocks.\n")
    p_vt.add_run("5. Tổng hợp TTS sớm: ").bold = True
    p_vt.add_run("Gateway cắt câu ngay khi có dấu câu, gọi TTS hoặc lấy từ TTS Cache, đẩy audio về Client.\n")
    p_vt.add_run("6. Hiển thị UI: ").bold = True
    p_vt.add_run("Client phát âm thanh, hiển thị transcript và dựng các khối UI động qua Registry.")

    add_callout(doc,
        "Nguyên tắc 'Client mỏng - Zero Secret Key': Client không lưu trữ API Key của bên thứ ba. Mọi yêu cầu gọi dịch vụ AI bắt buộc phải đi qua SaaS Gateway để kiểm soát hạn mức quota và bảo vệ tài nguyên.",
        title="NGUYÊN TẮC BẢO MẬT BẮT BUỘC"
    )

    # ==================== MỤC 3: 23 MẪU GOF DESIGN PATTERNS ====================
    doc.add_page_break()
    style_heading(doc, "3. Bản đồ Tích hợp 23 Mẫu Thiết kế GoF (Gang of Four)", 1)
    
    p_gof = doc.add_paragraph()
    p_gof.add_run("Dự án áp dụng đầy đủ 23 mẫu thiết kế GoF để đảm bảo tính module hóa, tính mở rộng và khả năng thay thế nhà cung cấp AI linh hoạt:")

    # Summary table for GoF
    gof_table = doc.add_table(rows=24, cols=4)
    gof_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    gof_headers = ["Nhóm & STT", "Tên Mẫu Thiết Kế", "Vị trí Triển khai trong Code", "Bài toán Giải quyết & Vai trò"]
    for i, h in enumerate(gof_headers):
        c = gof_table.cell(0, i)
        set_cell_background(c, "1E3A8A")
        set_cell_margins(c, 60, 60, 80, 80)
        p = c.paragraphs[0]
        p.add_run(h).bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(9)

    gof_all_data = [
        # Creational (5)
        ("Khởi tạo 1", "Abstract Factory", "apps/gateway/src/providers/factory.ts", "Tạo họ bộ điều hợp AI tương thích (STT, TTS, LLM) theo biến môi trường."),
        ("Khởi tạo 2", "Factory Method", "packages/shared/src/drills/DrillFactory.ts", "Khởi tạo đối tượng bài tập thích ứng (Trắc nghiệm, Điền từ, Ghép câu) theo khóa type."),
        ("Khởi tạo 3", "Builder", "packages/prompts/src/PromptBuilder.ts", "Lắp ráp prompt nhiều tầng (Persona Bé Cu Tít + Level CEFR + Kịch bản) và AgentMessage."),
        ("Khởi tạo 4", "Singleton", "apps/host-shell/src/bus/EventBus.ts", "Duy trì duy nhất một thực thể Event Bus phía Client và Connection Pool phía Gateway."),
        ("Khởi tạo 5", "Prototype", "packages/content/src/scenarios/ScenarioPrototype.ts", "Nhân bản nhanh kịch bản hội thoại mẫu (Đi chợ, Quán phở) để tùy biến cho người học."),
        
        # Structural (7)
        ("Cấu trúc 6", "Adapter", "apps/gateway/src/adapters/ (Stt, Tts)", "Chuẩn hóa API của Google Cloud, Azure, VBEE về chung giao diện SttProvider, TtsProvider."),
        ("Cấu trúc 7", "Facade", "apps/gateway/src/routes/chat.ts", "Gom chuỗi gọi STT, LLM Streaming và phát TTS sớm thành một endpoint /v1/chat/turn."),
        ("Cấu trúc 8", "Composite", "apps/host-shell/src/components/AgentUI/BlockTree.tsx", "Tổ chức các khối giao diện UI động thành cây phân cấp, xử lý đồng nhất khối đơn và khối lồng."),
        ("Cấu trúc 9", "Decorator", "apps/gateway/src/middleware/ (Auth, Quota, Log)", "Bọc các route handler để bổ sung kiểm tra token, kiểm soát hạn mức quota và log chi phí."),
        ("Cấu trúc 10", "Bridge", "packages/audio-dsp/src/audio/AudioCaptureBridge.ts", "Tách trừu tượng thu âm khỏi nền tảng thực thi (Web Audio API vs Capacitor Native Plugin)."),
        ("Cấu trúc 11", "Proxy", "apps/gateway/src/cache/TTSCacheProxy.ts", "Kiểm tra cache S3 cho file âm thanh TTS trước khi gọi API trả phí, tiết kiệm 60% chi phí."),
        ("Cấu trúc 12", "Flyweight", "packages/content/src/pitch/PitchReferenceFlyweight.ts", "Chia sẻ dữ liệu đường contour chuẩn 6 thanh và kho thẻ văn hóa tĩnh dùng chung."),

        # Behavioral (11)
        ("Hành vi 13", "Strategy", "packages/audio-dsp/src/pitch/PitchStrategy.ts", "Hoán đổi thuật toán trích xuất F0 giữa YIN (chuẩn xác) và McLeod (nhẹ) theo CPU máy."),
        ("Hành vi 14", "Observer", "apps/host-shell/src/bus/EventBus.ts", "Phát tín hiệu cho sự kiện liên remote (session.started, attempt.completed) và sóng F0 tới Canvas."),
        ("Hành vi 15", "Chain of Resp.", "apps/gateway/src/pipeline/RequestPipeline.ts", "Chuỗi xử lý yêu cầu tuần tự và chuỗi kiểm tra ngữ pháp câu A8 (Từ điển ➔ Luật ➔ LLM)."),
        ("Hành vi 16", "Command", "apps/host-shell/src/commands/UIBlockCommand.ts", "Đóng gói thao tác click trên UI Block thành Command Object, hỗ trợ Retry và lưu vết."),
        ("Hành vi 17", "State", "apps/mfe-conversation/src/state/TurnStateMachine.ts", "Quản lý vòng đời lượt thoại: IDLE ➔ RECORDING ➔ UPLOADING ➔ STREAMING ➔ PLAYING."),
        ("Hành vi 18", "Template Method", "apps/gateway/src/services/assessment/", "Định hình khung quy trình chấm phát âm A3: Chuẩn hóa NFC ➔ So khớp từ ➔ So contour ➔ Tính điểm."),
        ("Hành vi 19", "Mediator", "apps/host-shell/src/mediator/ShellMediator.ts", "Host Shell điều phối dữ liệu giữa 6 Remote MFE, triệt tiêu phụ thuộc import chéo."),
        ("Hành vi 20", "Iterator", "packages/shared/src/srs/SRSIterator.ts", "Duyệt qua danh sách thẻ từ vựng cần ôn theo thuật toán SM-2 mà không lộ cấu trúc bảng."),
        ("Hành vi 21", "Interpreter", "packages/content/src/honorifics/HonorificInterpreter.ts", "Diễn giải biểu thức đại từ xưng hô (Tuổi, Giới, Thứ bậc, Bối cảnh) ra cặp từ xưng hô chuẩn."),
        ("Hành vi 22", "Visitor", "apps/host-shell/src/protocol/BlockVisitor.ts", "Duyệt cây UI Block để làm sạch mã độc (Sanitizer) và thu thập thống kê (Analytics)."),
        ("Hành vi 23", "Memento", "apps/mfe-practice/src/sentence/SentenceBuilderMemento.ts", "Lưu ảnh chụp trạng thái vị trí các đốt tre từ ngữ, cung cấp tính năng Undo/Redo khi ghép câu.")
    ]

    for row_idx, r in enumerate(gof_all_data, start=1):
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(r):
            c = gof_table.cell(row_idx, col_idx)
            set_cell_background(c, bg)
            set_cell_margins(c, 45, 45, 60, 60)
            p = c.paragraphs[0]
            p.add_run(text)
            p.runs[0].font.size = Pt(8)
            if col_idx <= 1:
                p.runs[0].bold = True

    # ==================== MỤC 4: 8 THUẬT TOÁN TỰ VIẾT ====================
    doc.add_page_break()
    style_heading(doc, "4. Danh mục 8 Thuật toán Tự viết (A1 – A8)", 1)
    
    p_alg = doc.add_paragraph()
    p_alg.add_run("Do các API thương mại chưa hỗ trợ chuyên sâu các quy tắc đặc thù của tiếng Việt, hệ thống tự phát triển 8 thuật toán đóng gói độc lập:")

    alg_table = doc.add_table(rows=9, cols=5)
    alg_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    alg_headers = ["Mã", "Tên Thuật toán", "Đầu vào ➔ Đầu ra", "Môi trường", "Nguyên lý Xử lý Cốt lõi"]
    for i, h in enumerate(alg_headers):
        c = alg_table.cell(0, i)
        set_cell_background(c, "1E3A8A")
        set_cell_margins(c, 60, 60, 80, 80)
        p = c.paragraphs[0]
        p.add_run(h).bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(9)

    alg_data = [
        ("A1", "Trích xuất cao độ F0", "PCM 16 kHz ➔ Contour Semitone", "Web Worker", "Dùng giải thuật YIN/McLeod, lọc trung vị, sửa lỗi nhảy quãng tám, quy đổi F0 về thang Semitone."),
        ("A2", "So sánh Contour thanh điệu", "2 Contour ➔ Độ tương đồng 0-100", "Client Gói chung", "Sử dụng Dynamic Time Warping (DTW) kết hợp hệ số tương quan Pearson và luật cực trị nhận dạng 6 thanh."),
        ("A3", "Chấm phát âm tổng hợp", "Transcript + Câu mẫu ➔ Điểm số", "Gateway SaaS", "Chuẩn hóa chuỗi bằng Unicode NFC, tính sai khác từ ngữ kết hợp điểm contour A2 để xuất phản hồi sửa lỗi."),
        ("A4", "Lặp lại ngắt quãng (SM-2)", "Chất lượng 0-5 ➔ Khoảng cách ngày ôn", "Shared package", "Tính toán chu kỳ ôn tập Spaced Repetition cho từ vựng và câu theo độ suy giảm trí nhớ."),
        ("A5", "Kiểm tra trình độ thích ứng", "Chuỗi câu trả lời ➔ Level CEFR", "Gateway SaaS", "Thuật toán dạng Staircase / Elo thích ứng: làm đúng tăng độ khó, làm sai hạ độ khó, hội tụ sau 8-12 câu."),
        ("A6", "Bộ luật đại từ xưng hô", "Tuổi, Giới tính, Quan hệ ➔ Cặp đại từ", "Client + JSON", "Hệ thống bảng luật suy diễn đại từ gia đình (bác, chú, cô) và xã hội (anh, chị, em, thầy) với 20 cặp quan hệ."),
        ("A7", "Ánh xạ từ vựng phương ngữ", "Từ chuẩn, Miền ➔ Từ tương đương", "JSON + Gateway", "Bảng tra cứu từ ngữ tương đương Bắc - Trung - Nam (bắp ➔ ngô) kết hợp kích hoạt đúng giọng TTS theo miền."),
        ("A8", "Kiểm tra trật tự câu ghép", "Mảng Token từ ➔ Hợp lệ / Sai vị trí", "Gateway SaaS", "So khớp mảng từ với tập đáp án hợp lệ; nếu câu nằm ngoài tập mẫu sẽ gửi LLM phân tích và giải thích.")
    ]

    for row_idx, r in enumerate(alg_data, start=1):
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(r):
            c = alg_table.cell(row_idx, col_idx)
            set_cell_background(c, bg)
            set_cell_margins(c, 45, 45, 60, 60)
            p = c.paragraphs[0]
            p.add_run(text)
            p.runs[0].font.size = Pt(8)
            if col_idx == 0:
                p.runs[0].bold = True

    # ==================== MỤC 5: TOÀN BỘ TECH STACK & LIÊN KẾT TÀI LIỆU ====================
    doc.add_page_break()
    style_heading(doc, "5. Bảng Tra cứu Toàn bộ Tech Stack & Liên kết Tài liệu Chính thức", 1)
    
    p_ts_intro = doc.add_paragraph()
    p_ts_intro.add_run("Bảng bên dưới tổng hợp đầy đủ tất cả các công nghệ được sử dụng trong toàn bộ dự án (Frontend, Backend, AI, Database, Storage, Testing, Tooling, Cloud), kèm gói cài đặt NPM và liên kết tài liệu chính thức (Official Documentation):")

    ts_table = doc.add_table(rows=36, cols=4)
    ts_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    ts_headers = ["Phân Tầng", "Công nghệ / Dịch vụ", "Thư viện NPM / Gói cài đặt", "Liên kết Tài liệu Chính thức (Official Docs)"]
    for i, h in enumerate(ts_headers):
        c = ts_table.cell(0, i)
        set_cell_background(c, "1E3A8A")
        set_cell_margins(c, 60, 60, 80, 80)
        p = c.paragraphs[0]
        p.add_run(h).bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(8.5)

    all_tech_data = [
        # Frontend & Client Framework
        ("Frontend", "React 18 / 19", "react, react-dom", "https://react.dev/"),
        ("Frontend", "TypeScript", "typescript", "https://www.typescriptlang.org/docs/"),
        ("Frontend", "Vite", "vite", "https://vite.dev/guide/"),
        ("Frontend", "Module Federation", "@module-federation/vite", "https://module-federation.io/"),
        ("Frontend", "Tailwind CSS", "tailwindcss, postcss, autoprefixer", "https://tailwindcss.com/docs"),
        ("Frontend", "Radix UI & shadcn/ui", "@radix-ui/react-*", "https://ui.shadcn.com/docs"),
        ("Frontend", "TanStack Query", "@tanstack/react-query", "https://tanstack.com/query/latest"),
        ("Frontend", "Zustand (State)", "zustand", "https://zustand.docs.pmnd.rs/"),
        ("Frontend", "React Router", "react-router-dom", "https://reactrouter.com/"),
        ("Frontend", "i18next (Đa ngôn ngữ)", "i18next, react-i18next", "https://react.i18next.com/"),
        ("Frontend", "PWA Support", "vite-plugin-pwa", "https://vite-pwa-org.netlify.app/"),
        ("Frontend", "Capacitor (Mobile App)", "@capacitor/core, @capacitor/cli", "https://capacitorjs.com/docs"),
        ("Frontend", "Lucide Icons", "lucide-react", "https://lucide.dev/"),
        ("Frontend", "Chart.js (Biểu đồ)", "chart.js", "https://www.chartjs.org/docs/latest/"),

        # Client Audio DSP
        ("Audio DSP", "Web Audio API", "Web API Trình duyệt có sẵn", "https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API"),
        ("Audio DSP", "AudioWorklet (16kHz PCM)", "Web API Trình duyệt có sẵn", "https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet"),
        ("Audio DSP", "Thuật toán YIN Pitch", "pitch-detection", "https://github.com/ashok-khanna/pitch-detection"),

        # SaaS Gateway Backend
        ("Backend", "Node.js LTS", "node.js runtime", "https://nodejs.org/docs/latest/api/"),
        ("Backend", "Fastify", "fastify, @fastify/cors, @fastify/jwt", "https://fastify.dev/docs/latest/"),
        ("Backend", "Zod Validation", "zod, fastify-type-provider-zod", "https://zod.dev/"),
        ("Backend", "Pino Logger", "pino, pino-pretty", "https://getpino.io/"),
        ("Backend", "Rate Limit & Quota", "@fastify/rate-limit, ioredis", "https://github.com/fastify/fastify-rate-limit"),

        # Database, Cache & Storage
        ("Database", "PostgreSQL", "postgres (driver)", "https://www.postgresql.org/docs/"),
        ("Database", "Drizzle ORM", "drizzle-orm, drizzle-kit", "https://orm.drizzle.team/docs/overview"),
        ("Database", "Supabase (Postgres+Auth)", "@supabase/supabase-js", "https://supabase.com/docs"),
        ("Database", "Redis (Cache & Quota)", "ioredis", "https://ioredis.readthedocs.io/"),
        ("Storage", "Cloudflare R2 (S3-Compatible)", "@aws-sdk/client-s3", "https://developers.cloudflare.com/r2/"),

        # AI Services
        ("AI - LLM", "Google Gemini 1.5 Flash", "@google/genai, @google/generative-ai", "https://ai.google.dev/gemini-api/docs"),
        ("AI - LLM", "OpenAI GPT-4o-mini (Fallback)", "openai", "https://platform.openai.com/docs/guides/text-generation"),
        ("AI - STT", "Google Cloud STT (vi-VN)", "@google-cloud/speech", "https://cloud.google.com/speech-to-text/docs"),
        ("AI - STT/TTS", "Azure Cognitive Speech", "microsoft-cognitiveservices-speech-sdk", "https://learn.microsoft.com/en-us/azure/ai-services/speech-service/"),
        ("AI - TTS", "Google Cloud TTS", "@google-cloud/text-to-speech", "https://cloud.google.com/text-to-speech/docs"),

        # Monorepo, Testing & Deployment
        ("Tooling", "Turborepo & PNPM", "turbo, pnpm", "https://turbo.build/repo/docs"),
        ("Testing", "Vitest & Playwright", "vitest, @playwright/test, msw", "https://vitest.dev/ · https://playwright.dev/"),
        ("Deployment", "Docker & Cloud Run", "docker, gcloud CLI", "https://docs.docker.com/ · https://cloud.google.com/run/docs")
    ]

    for row_idx, r in enumerate(all_tech_data, start=1):
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(r):
            c = ts_table.cell(row_idx, col_idx)
            set_cell_background(c, bg)
            set_cell_margins(c, 40, 40, 60, 60)
            p = c.paragraphs[0]
            p.add_run(text)
            p.runs[0].font.size = Pt(7.8)
            if col_idx == 0:
                p.runs[0].bold = True
            elif col_idx == 3:
                p.runs[0].font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

    # ==================== MỤC 6: HƯỚNG DẪN CÀI ĐẶT & CODE MẪU ====================
    doc.add_page_break()
    style_heading(doc, "6. Hướng dẫn Cài đặt & Đoạn Mã Mẫu Thực Chiến", 1)

    style_heading(doc, "6.1 Khởi tạo Dự án & Cài đặt Thư viện Cốt lõi", 2)
    p_inst = doc.add_paragraph()
    p_inst.add_run("Các lệnh sau dùng để cài đặt toàn bộ phụ thuộc cho Gateway và các gói dùng chung trong monorepo:")
    
    add_code_block(doc, 
        "# 1. Cài đặt các gói AI (Gemini, OpenAI, Speech SDK)\n"
        "pnpm add @google/genai openai @google-cloud/speech microsoft-cognitiveservices-speech-sdk\n\n"
        "# 2. Cài đặt Database ORM & Storage (Postgres, Drizzle, Redis, S3)\n"
        "pnpm add drizzle-orm postgres ioredis @aws-sdk/client-s3 @aws-sdk/s3-request-presigner\n"
        "pnpm add -D drizzle-kit @types/pg\n\n"
        "# 3. Cài đặt Fastify Gateway & Zod Validation\n"
        "pnpm add fastify @fastify/cors @fastify/sensible @fastify/rate-limit fastify-type-provider-zod zod"
    )

    style_heading(doc, "6.2 Mã mẫu Drizzle Schema (PostgreSQL)", 2)
    p_sc = doc.add_paragraph()
    p_sc.add_run("Đoạn mã sau định nghĩa bảng người dùng và thẻ nhớ ôn tập ngắt quãng (SM-2) trong packages/contracts/src/schema.ts:")

    add_code_block(doc,
        "import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';\n\n"
        "export const users = pgTable('users', {\n"
        "  id: uuid('id').primaryKey().defaultRandom(),\n"
        "  email: text('email').notNull().unique(),\n"
        "  targetDialect: text('target_dialect').default('north'), // north | central | south\n"
        "  level: integer('level').default(1),\n"
        "  createdAt: timestamp('created_at').defaultNow()\n"
        "});\n\n"
        "export const srsCards = pgTable('srs_cards', {\n"
        "  id: uuid('id').primaryKey().defaultRandom(),\n"
        "  userId: uuid('user_id').references(() => users.id),\n"
        "  itemRef: text('item_ref').notNull(),\n"
        "  ease: integer('ease').default(250), // hệ số 2.50\n"
        "  intervalDays: integer('interval_days').default(1),\n"
        "  repetitions: integer('repetitions').default(0),\n"
        "  dueAt: timestamp('due_at').notNull()\n"
        "});"
    )

    style_heading(doc, "6.3 Mã mẫu Gọi Gemini LLM với Structured JSON Schema", 2)
    p_gem = doc.add_paragraph()
    p_gem.add_run("Gọi mô hình Gemini 1.5 Flash sinh bài tập với cấu trúc JSON có kiểm tra kiểu dữ liệu tự động:")

    add_code_block(doc,
        "import { GoogleGenAI, Type } from '@google/genai';\n\n"
        "const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });\n\n"
        "export async function generateDrill(topic: string, level: number) {\n"
        "  const res = await ai.models.generateContent({\n"
        "    model: 'gemini-1.5-flash',\n"
        "    contents: `Tạo 1 bài trắc nghiệm tiếng Việt chủ đề ${topic} trình độ CEFR A${level}.`,\n"
        "    config: {\n"
        "      responseMimeType: 'application/json',\n"
        "      responseSchema: {\n"
        "        type: Type.OBJECT,\n"
        "        properties: {\n"
        "          question: { type: Type.STRING },\n"
        "          options: { type: Type.ARRAY, items: { type: Type.STRING } },\n"
        "          correctIndex: { type: Type.INTEGER },\n"
        "          explanation: { type: Type.STRING }\n"
        "        },\n"
        "        required: ['question', 'options', 'correctIndex', 'explanation']\n"
        "      }\n"
        "    }\n"
        "  });\n"
        "  return JSON.parse(res.text);\n"
        "}"
    )

    # ==================== MỤC 7: MẪU TỆP CẤU HÌNH .ENV.EXAMPLE ====================
    style_heading(doc, "7. Tệp Mẫu Cấu Hình Môi Trường Chuẩn (.env.example)", 1)
    p_env = doc.add_paragraph()
    p_env.add_run("Các thành viên copy mẫu bên dưới vào tệp apps/gateway/.env trước khi khởi chạy:")

    add_code_block(doc,
        "# CỔNG GATEWAY\n"
        "NODE_ENV=development\n"
        "PORT=4000\n"
        "CORS_ORIGIN=http://localhost:3000,http://localhost:5173\n\n"
        "# POSTGRESQL & REDIS\n"
        "DATABASE_URL=postgresql://postgres:pass@localhost:5432/vietlearning?sslmode=require\n"
        "REDIS_URL=redis://default:pass@localhost:6379\n\n"
        "# CLOUDFLARE R2 OBJECT STORAGE (TTS CACHE)\n"
        "S3_ENDPOINT=https://account_id.r2.cloudflarestorage.com\n"
        "S3_ACCESS_KEY_ID=your_access_key\n"
        "S3_SECRET_ACCESS_KEY=your_secret_key\n"
        "S3_BUCKET_NAME=vietlearning-audio-cache\n"
        "S3_PUBLIC_DOMAIN=https://audio.vietlearning.app\n\n"
        "# AI KEYS\n"
        "GEMINI_API_KEY=AIzaSy...\n"
        "OPENAI_API_KEY=sk-proj-...\n"
        "AZURE_SPEECH_KEY=your_azure_key\n"
        "AZURE_SPEECH_REGION=southeastasia\n"
        "GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json\n\n"
        "# QUOTA THEO NGÀY (PER USER)\n"
        "MAX_STT_SECONDS_PER_DAY=600\n"
        "MAX_TTS_CHARS_PER_DAY=15000\n"
        "MAX_LLM_TOKENS_PER_DAY=100000\n"
        "AUDIO_TTL_DAYS=30"
    )

    # ==================== MỤC 8: 12 MÀN HÌNH MVP & PHÂN CÔNG ====================
    doc.add_page_break()
    style_heading(doc, "8. Đặc tả 12 Màn hình MVP & Phân vai 5 Thành viên", 1)
    
    scr_table = doc.add_table(rows=13, cols=4)
    scr_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    scr_headers = ["Màn hình & Phụ trách", "Remote MFE", "Mức Cam Kết (Bắt buộc)", "Mức Mở Rộng (Nâng cao)"]
    for i, h in enumerate(scr_headers):
        c = scr_table.cell(0, i)
        set_cell_background(c, "1E3A8A")
        set_cell_margins(c, 60, 60, 80, 80)
        p = c.paragraphs[0]
        p.add_run(h).bold = True
        p.runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        p.runs[0].font.size = Pt(8.5)

    screens_data = [
        ("M1. Chat Canvas (M3 FE, M1 BE)", "mfe-conversation", "Nhập text & nói; multi-turn N lượt; streaming SSE; chip sửa lỗi; render ≥ 4 khối UI.", "Tóm tắt phiên; sửa lỗi inline; tìm trong lịch sử."),
        ("M2. Pitch Visualizer (M5)", "mfe-speech-lab", "Thu âm, vẽ đè 2 đường contour cho 6 thanh và 20 từ/cụm; nghe mẫu; điểm tương đồng DTW.", "30 từ/cụm; tự động phát hiện thanh lệch; phản hồi bằng lời."),
        ("M3. Honorific Matrix (M2)", "mfe-knowledge", "Chọn tuổi/giới/quan hệ/trang trọng ➔ Cặp đại từ + ví dụ + audio mẫu; 20 cặp quan hệ.", "30 cặp quan hệ; quiz nhanh; LLM giải thích tình huống."),
        ("M4. AR Camera Surface (M5 FE, M1 BE)", "mfe-vision", "Mở camera chụp quán nước gốc đa ➔ Vision AI dán nhãn từ vựng, nghe đọc, lưu vào SRS.", "Overlay liên tục theo thời gian thực (tracking 3D)."),
        ("M5. Adaptive Drill Cards (M4 FE, M2 BE)", "mfe-practice", "5 dạng bài (trắc nghiệm, điền từ, nghe chọn, ghép từ, đọc lại) sinh bằng Gemini schema.", "Tự động điều chỉnh độ khó theo lịch sử thời gian thực."),
        ("M6. Dialect Switcher (M5, M2)", "mfe-speech-lab", "Đối chiếu Bắc/Trung/Nam cho 30 từ/cụm; nghe giọng đọc theo từng miền.", "40 từ/cụm; chuyển đổi toàn bộ hội thoại sang phương ngữ."),
        ("M7. Roleplay Simulator (M3 FE, M1 BE)", "mfe-conversation", "4 kịch bản (chợ quê trả giá, hỏi đường, quán phở, làm quen) có mục tiêu và tổng kết lỗi.", "6 kịch bản (thêm taxi, khách sạn); chấm điểm nhiệm vụ."),
        ("M8. Sentence Builder (M4 FE, M2 BE)", "mfe-practice", "Kéo-thả token đốt tre trúc, kiểm tra hợp lệ và giải thích lỗi trật tự câu (60 câu).", "100 câu; LLM sinh cấu trúc câu mới theo chủ đề."),
        ("M9. Analytics Dashboard (M4 FE, M2 BE)", "mfe-learner", "Streak, thời gian học, độ chính xác kỹ năng, thẻ đến hạn ôn tập SM-2 đồng bộ server.", "Dự báo tiến độ CEFR; hỗ trợ chế độ ôn tập ngoại tuyến."),
        ("M10. Culture Guide (M2)", "mfe-knowledge", "20 thẻ phong tục tập quán, kiêng kỵ dân gian; hỏi đáp LLM dựa trên thẻ xác thực.", "25 thẻ; gợi ý thẻ văn hóa theo tình huống Roleplay."),
        ("M11. Adaptive Onboarding (M4 FE, M2 BE)", "mfe-learner", "Khảo sát mục tiêu, phương ngữ; bài kiểm tra thích ứng 8-12 câu (A5) ➔ xếp level 1-6.", "Đánh giá chi tiết phát âm ngay trong bài kiểm tra."),
        ("M12. AI Preferences (M4 FE, M1 BE)", "mfe-learner", "Tùy biến giọng đọc 3 miền, tốc độ nói, mức sửa lỗi, đổi persona Bé Cu Tít.", "Tự động học hành vi của người dùng để cá nhân hóa.")
    ]

    for row_idx, r in enumerate(screens_data, start=1):
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, text in enumerate(r):
            c = scr_table.cell(row_idx, col_idx)
            set_cell_background(c, bg)
            set_cell_margins(c, 40, 40, 60, 60)
            p = c.paragraphs[0]
            p.add_run(text)
            p.runs[0].font.size = Pt(8)
            if col_idx == 0:
                p.runs[0].bold = True

    # ==================== MỤC 9: ĐỊNH NGHĨA HOÀN THÀNH (DOD) ====================
    doc.add_page_break()
    style_heading(doc, "9. Quy chuẩn Vận hành & Định nghĩa Hoàn thành (DoD)", 1)
    
    p_dod = doc.add_paragraph()
    p_dod.add_run("Mọi tính năng khi hoàn thành bắt buộc phải thỏa mãn 6 tiêu chí kỹ thuật sau:\n")
    p_dod.add_run("1. Tuân thủ Contract: ").bold = True
    p_dod.add_run("Có Zod schema đầy đủ trong packages/contracts; vượt qua kiểm thử Mock Server.\n")
    p_dod.add_run("2. Kiểm thử Tự động: ").bold = True
    p_dod.add_run("Có Unit Test cho logic tính toán cốt lõi; kịch bản E2E Smoke Test chạy xanh trên CI.\n")
    p_dod.add_run("3. Đa nền tảng: ").bold = True
    p_dod.add_run("Chạy ổn định trên Chrome, Safari iOS và Android thật đối với các màn hình có micro và camera.\n")
    p_dod.add_run("4. Xử lý Trạng thái Ngoại lệ: ").bold = True
    p_dod.add_run("Có đầy đủ trạng thái Loading, Error, Empty. Hiển thị thông báo thân thiện khi QUOTA_EXCEEDED.\n")
    p_dod.add_run("5. Thẩm định Tiếng Việt: ").bold = True
    p_dod.add_run("Văn bản tiếng Việt chuẩn hóa Unicode NFC và được người bản ngữ trong đội ngũ phê duyệt.\n")
    p_dod.add_run("6. Bảo mật & An toàn: ").bold = True
    p_dod.add_run("Tuyệt đối không để lộ API Key phía Client; file ghi âm có thời hạn xóa TTL 30 ngày.")

    # Save
    master_docx_path = r"c:\D\Kì cuối\Chuyên đề mobile and pervasive computing - SE405.R11\đồ án mobile\So_Tay_Toan_Dien_Tech_Stack_Va_Kien_Truc_He_Thong.docx"
    doc.save(master_docx_path)
    print("MASTER_DOCX_SUCCESSFULLY_GENERATED")

if __name__ == '__main__':
    build_master_doc()
