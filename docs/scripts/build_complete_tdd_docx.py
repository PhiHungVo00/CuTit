# -*- coding: utf-8 -*-
"""
build_complete_tdd_docx.py
Comprehensive builder for the Technical Design Document (TDD).
Covers all 16 sections + 2 appendices of 02_Bao_cao_ky_thuat_TDD_UIT.pdf,
incorporating ASD-STE100 Vietnamese style, 300 DPI architecture diagram,
23 GoF patterns, 35+ verified documentation links, data models, and ADRs.
"""

import os
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml, OxmlElement
from docx.oxml.ns import nsdecls, qn

BASE_DIR = r"c:\D\Kì cuối\Chuyên đề mobile and pervasive computing - SE405.R11\đồ án mobile"

def set_cell_background(cell, hex_color):
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=45, bottom=45, left=65, right=65):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('w:top', top), ('w:bottom', bottom), ('w:left', left), ('w:right', right)]:
        node = OxmlElement(m)
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def style_heading(doc, text, level):
    p = doc.add_heading(text, level=level)
    p.paragraph_format.keep_with_next = True
    run = p.runs[0]
    run.font.name = 'Arial'
    if level == 1:
        run.font.size = Pt(13.5)
        run.bold = True
        run.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A) # Deep Navy
        p.paragraph_format.space_before = Pt(13)
        p.paragraph_format.space_after = Pt(4)
    elif level == 2:
        run.font.size = Pt(11)
        run.bold = True
        run.font.color.rgb = RGBColor(0x33, 0x41, 0x55) # Slate
        p.paragraph_format.space_before = Pt(9)
        p.paragraph_format.space_after = Pt(3)
    elif level == 3:
        run.font.size = Pt(9.5)
        run.bold = True
        run.font.color.rgb = RGBColor(0x47, 0x55, 0x69)
        p.paragraph_format.space_before = Pt(7)
        p.paragraph_format.space_after = Pt(2)
    return p

def add_callout(doc, text, title="GHI CHÚ QUAN TRỌNG", border_color="6366F1", bg_color="F8FAFC"):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = table.cell(0, 0)
    c.width = Inches(6.5)
    set_cell_background(c, bg_color)
    set_cell_margins(c, 55, 55, 80, 80)
    
    borders = parse_xml(
        f'<w:tcBorders {nsdecls("w")}>'
        f'  <w:left w:val="single" w:sz="36" w:space="0" w:color="{border_color}"/>'
        f'  <w:top w:val="none"/>'
        f'  <w:right w:val="none"/>'
        f'  <w:bottom w:val="none"/>'
        f'</w:tcBorders>'
    )
    c._tc.get_or_add_tcPr().append(borders)
    
    p = c.paragraphs[0]
    p.paragraph_format.space_after = Pt(2)
    r_title = p.add_run(f"[{title}]\n")
    r_title.bold = True
    r_title.font.name = 'Arial'
    r_title.font.size = Pt(8.5)
    r_title.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
    
    r_body = p.add_run(text)
    r_body.font.name = 'Arial'
    r_body.font.size = Pt(8.2)
    r_body.font.color.rgb = RGBColor(0x33, 0x41, 0x55)
    
    p_after = doc.add_paragraph()
    p_after.paragraph_format.space_before = Pt(0)
    p_after.paragraph_format.space_after = Pt(2)

def add_code_block(doc, code_str):
    table = doc.add_table(rows=1, cols=1)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    c = table.cell(0, 0)
    c.width = Inches(6.5)
    set_cell_background(c, "0F172A") # Slate 900
    set_cell_margins(c, 45, 45, 65, 65)
    p = c.paragraphs[0]
    p.paragraph_format.space_after = Pt(0)
    r = p.add_run(code_str)
    r.font.name = 'Consolas'
    r.font.size = Pt(7.6)
    r.font.color.rgb = RGBColor(0xE2, 0xE8, 0xF0)
    
    p_after = doc.add_paragraph()
    p_after.paragraph_format.space_before = Pt(0)
    p_after.paragraph_format.space_after = Pt(2)

def format_table(table, col_widths, headers, data, header_bg="1E3A8A"):
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(headers):
        c = table.cell(0, i)
        set_cell_background(c, header_bg)
        set_cell_margins(c, 40, 40, 50, 50)
        p = c.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        run = p.add_run(h)
        run.bold = True
        run.font.name = 'Arial'
        run.font.size = Pt(7.8)
        run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    
    for row_idx, row_data in enumerate(data, start=1):
        bg = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx, cell_value in enumerate(row_data):
            c = table.cell(row_idx, col_idx)
            set_cell_background(c, bg)
            set_cell_margins(c, 25, 25, 40, 40)
            p = c.paragraphs[0]
            run = p.add_run(str(cell_value))
            run.font.name = 'Arial'
            run.font.size = Pt(7.4)
            if col_idx == 0:
                run.bold = True
            if "http://" in str(cell_value) or "https://" in str(cell_value):
                run.font.color.rgb = RGBColor(0x25, 0x63, 0xEB)

    for row in table.rows:
        for idx, width in enumerate(col_widths):
            row.cells[idx].width = width

def build_complete_document():
    doc = Document()
    
    # Page Setup: Margins 0.75 in
    for s in doc.sections:
        s.top_margin = Inches(0.75)
        s.bottom_margin = Inches(0.75)
        s.left_margin = Inches(0.75)
        s.right_margin = Inches(0.75)
        s.page_width = Inches(8.5)
        s.page_height = Inches(11.0)

    # Style defaults
    style = doc.styles['Normal']
    font = style.font
    font.name = 'Arial'
    font.size = Pt(8.8)
    font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
    style.paragraph_format.line_spacing = 1.15
    style.paragraph_format.space_after = Pt(3)

    # ==================== TRANG BÌA ====================
    p_uni = doc.add_paragraph()
    p_uni.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_uni = p_uni.add_run("ĐẠI HỌC QUỐC GIA TP. HỒ CHÍ MINH\nTRƯỜNG ĐẠI HỌC CÔNG NGHỆ THÔNG TIN (UIT)\n")
    r_uni.bold = True
    r_uni.font.size = Pt(11)
    r_uni.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    r_sub = p_uni.add_run("KHOA KỸ THUẬT PHẦN MỀM · BỘ MÔN HỆ THỐNG THÔNG TIN\n")
    r_sub.font.size = Pt(9)
    r_sub.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    p_spacer = doc.add_paragraph()
    p_spacer.paragraph_format.space_before = Pt(25)

    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_title = p_title.add_run("BÁO CÁO THIẾT KẾ KỸ THUẬT KIẾN TRÚC TOÀN DIỆN\n(TECHNICAL DESIGN DOCUMENT - TDD)\n")
    r_title.bold = True
    r_title.font.size = Pt(17)
    r_title.font.color.rgb = RGBColor(0x1E, 0x3A, 0x8A)

    r_name = p_title.add_run("HỆ THỐNG HỌC TIẾNG VIỆT THÔNG MINH CHO NGƯỜI NƯỚC NGOÀI\nCÙNG LINH VẬT BÉ CU TÍT (AGENTIC VIETNAMESE LEARNING)\n")
    r_name.bold = True
    r_name.font.size = Pt(12.5)
    r_name.font.color.rgb = RGBColor(0x63, 0x66, 0xF1)

    r_std = p_title.add_run("Tiêu chuẩn ASD-STE100 (Simplified Technical English) · Bản ngữ Tiếng Việt\nĐầy đủ 16 Mục Kỹ Thuật + 2 Phụ Lục của Báo Cáo UIT · 23 Mẫu GoF · 35+ Link Tech Stack Docs\n")
    r_std.font.size = Pt(9)
    r_std.font.italic = True
    r_std.font.color.rgb = RGBColor(0x47, 0x55, 0x69)

    p_meta = doc.add_paragraph()
    p_meta.paragraph_format.space_before = Pt(35)
    p_meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r_meta = p_meta.add_run(
        "Môn học: Chuyên đề Mobile & Pervasive Computing (SE405.R11)\n"
        "Đội ngũ thực hiện: 5 Thành viên (M1, M2, M3, M4, M5) + Lead Dev / Architect\n"
        "Phiên bản: 2.0 Hoàn thiện (Chính thức)\n"
        "Năm học: Học kỳ cuối 2026\n"
    )
    r_meta.font.size = Pt(9)
    r_meta.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    add_callout(doc,
        "Tài liệu này là bản thiết kế kỹ thuật chuẩn mực duy nhất (Single Source of Truth) phục vụ phân chia công việc cho 5 thành viên nhóm và nghiệm thu đồ án. Nội dung bao gồm toàn vẹn 16 mục kỹ thuật, 2 phụ lục, bảng tra cứu link tài liệu 35+ công nghệ, sơ đồ phân tầng 300 DPI và bản đồ tích hợp 23 mẫu GoF.",
        title="ĐỊNH VỊ TÀI LIỆU KỸ THUẬT"
    )

    # ==================== MỤC LỤC TỔNG QUAN ====================
    doc.add_page_break()
    style_heading(doc, "Mục Lục Tổng Quan 16 Mục Kỹ Thuật & Phụ Lục", 1)
    
    toc_data = [
        ("Mục 1", "Mục đích và phạm vi", "Trang 3"),
        ("Mục 2", "Yêu cầu và ràng buộc → Quyết định thiết kế", "Trang 3"),
        ("Mục 3", "Nguyên tắc kiến trúc", "Trang 4"),
        ("Mục 4", "Kiến trúc tổng thể, Luồng Voice Turn & Bảng Tech Stack đầy đủ", "Trang 5"),
        ("Mục 5", "Thiết kế Micro Frontend và Agent UI Protocol", "Trang 9"),
        ("Mục 6", "Thiết kế Gateway SaaS (Pipeline, Adapters, Endpoints)", "Trang 11"),
        ("Mục 7", "Ma trận nhà cung cấp API (STT, TTS, LLM, Vision)", "Trang 13"),
        ("Mục 8", "Danh mục 8 thuật toán tự viết & Quy trình Pitch F0", "Trang 14"),
        ("Mục 9", "Đặc tả chi tiết 12 màn hình MVP (Cam kết & Mở rộng)", "Trang 16"),
        ("Mục 10", "Mô hình dữ liệu (ERD, Bảng CSDL & Mã mẫu Drizzle ORM)", "Trang 19"),
        ("Mục 11", "Bảo mật, riêng tư và kiểm soát chi phí", "Trang 21"),
        ("Mục 12", "Yêu cầu phi chức năng (Ngân sách độ trễ, Tải trang, Trợ năng)", "Trang 22"),
        ("Mục 13", "Công cụ, AI Agents hỗ trợ và quy trình phát triển", "Trang 23"),
        ("Mục 14", "Phân vai 5 thành viên, Lộ trình 8 tuần & Thang giảm độ sâu", "Trang 24"),
        ("Mục 15", "Spike tuần 1 (Gate G1), Ma trận rủi ro & 8 Quyết định ADR", "Trang 26"),
        ("Mục 16", "Câu hỏi cần BA và Lead Dev xác nhận tại Kickoff", "Trang 28"),
        ("Phụ lục A", "Cấu trúc kho mã nguồn Monorepo đề xuất", "Trang 29"),
        ("Phụ lục B", "Quy chuẩn nghiệm thu kỹ thuật (Definition of Done - DoD)", "Trang 29")
    ]
    t_toc = doc.add_table(rows=19, cols=3)
    format_table(t_toc, [Inches(1.1), Inches(4.4), Inches(1.0)], ["Mục", "Tên Đề Mục Kỹ Thuật", "Vị Trí"], toc_data)

    # ==================== MỤC 1: MỤC ĐÍCH VÀ PHẠM VI ====================
    doc.add_page_break()
    style_heading(doc, "1. Mục đích và Phạm vi", 1)
    
    p = doc.add_paragraph()
    p.add_run("Tài liệu này là bản thiết kế kỹ thuật chuẩn mực (Technical Design Document - TDD) nhằm phục vụ Lead Dev phân chia công việc cho 5 thành viên và đảm bảo toàn đội ngũ phát triển trên một kiến trúc thống nhất. Tài liệu xác định rõ ràng: cấu trúc hệ thống, ranh giới giữa việc tích hợp API thương mại và tự viết thuật toán đặc thù, hợp đồng dữ liệu giữa các module, đặc tả chi tiết từng màn hình và trách nhiệm sở hữu của từng thành viên.")
    
    style_heading(doc, "1.1 Bối cảnh Đề tài & Linh vật Bé Cu Tít", 2)
    p = doc.add_paragraph()
    p.add_run("Đề tài hướng tới việc dạy tiếng Việt giao tiếp tự nhiên cho người nước ngoài thông qua trợ lý ảo thông minh mang bản sắc văn hóa Việt Nam.\n")
    p.add_run("• Linh vật Bé Cu Tít: ").bold = True
    p.add_run("Hình tượng cậu bé 7 tuổi hiếu động, đội mũ lồng đèn ngôi sao, mặc áo ba lỗ, mang túi vải mộc mạc làng quê. Bé Cu Tít đóng vai trò là người bạn đồng hành trò chuyện, chỉnh sửa phát âm và hướng dẫn phong tục tập quán.\n")
    p.add_run("• Phong cách Thiết kế Stitch (ID: 8474068980628013960): ").bold = True
    p.add_run("Kết hợp giữa tính tối giản thông minh (Agentic Minimalist) và sắc màu truyền thống: Electric Indigo (#6366F1), Emerald Green (#10B981), Amber (#F59E0B), Deep Slate (#0F172A). Phông chữ Be Vietnam Pro tối ưu dấu thanh tiếng Việt.")

    style_heading(doc, "1.2 Phạm vi Dự án (In-Scope & Out-of-Scope)", 2)
    p = doc.add_paragraph()
    p.add_run("• Trong phạm vi (In-Scope): ").bold = True
    p.add_run("Hoàn thiện 12 màn hình MVP, Gateway SaaS trung gian, tích hợp dịch vụ AI đám mây (STT, TTS, LLM, Vision), cơ sở dữ liệu, bảo mật, vận hành, phân vai 5 thành viên và lộ trình 8 tuần.\n")
    p.add_run("• Ngoài phạm vi (Out-of-Scope): ").bold = True
    p.add_run("Bảng phân việc chi tiết theo ngày (Lead Dev lập từ Mục 14), thiết kế đồ họa chi tiết từng pixel (do BA/Lead Dev cung cấp), tự huấn luyện hay tự host mô hình AI cục bộ trong giai đoạn MVP.\n")
    p.add_run("• Nguồn gốc tài liệu: ").bold = True
    p.add_run("Kế thừa yêu cầu của Business Analyst (BA) và các tài liệu kỹ thuật nội bộ (Báo cáo kỹ thuật UIT, đánh giá khả thi, task board). Mọi nhận định về năng lực API bên thứ ba được đưa vào Spike tuần 1 (Mục 15) để kiểm chứng thực tế.")

    # ==================== MỤC 2: YÊU CẦU VÀ RÀNG BUỘC → QUYẾT ĐỊNH THIẾT KẾ ====================
    doc.add_page_break()
    style_heading(doc, "2. Yêu cầu và Ràng buộc → Quyết định Thiết kế", 1)
    
    p = doc.add_paragraph()
    p.add_run("Bảng bên dưới ánh xạ trực tiếp các ràng buộc bài toán sang quyết định kiến trúc cụ thể nhằm đảm bảo tính khả thi cao nhất:")

    r_data = [
        ("R1", "Đủ 12 màn hình MVP, không cắt bỏ bất kỳ màn hình nào", "Phát triển 12 module màn hình; mỗi màn hình định nghĩa 2 mức: Cam kết (bắt buộc) và Mở rộng (nếu dư công). Khi thiếu tải chỉ giảm độ sâu tính năng, tuyệt đối không bỏ màn hình.", "Mục 9, 14"),
        ("R2", "Micro Frontend bằng React; UI tương tác động cho AI Agent", "Xây dựng Host Shell + 6 Remote MFE (Module Federation). AI Agent trả về khối giao diện có cấu trúc (Agent UI Protocol); Host Shell dựng component qua Registry.", "Mục 5"),
        ("R3", "Quy mô 5 thành viên (Lead Dev và BA hỗ trợ bên ngoài)", "Phân bổ 5 vai sở hữu module và màn hình độc lập, tối thiểu hóa phụ thuộc chéo.", "Mục 14"),
        ("R4", "Thời gian hoàn thành trong 2 tháng (8 tuần)", "Áp dụng lộ trình 8 tuần có các cổng kiểm soát (Gate G1 - G5); tuần 6 đóng băng tính năng (Feature Freeze), tuần 7-8 tích hợp, mở rộng và ổn định hóa.", "Mục 14"),
        ("R5", "Hệ thống SaaS Online: Server nhận request, gọi API, trả kết quả", "Xây dựng Gateway Stateless: Xác thực ➔ Kiểm tra Quota ➔ Gọi Provider Adapter ➔ Chuẩn hóa dữ liệu ➔ Trả Client. Client tuyệt đối không giữ khóa bí mật API.", "Mục 6"),
        ("R6", "Ưu tiên tích hợp API thương mại; chỉ viết thuật toán khi thiếu API", "Thiết lập Ma trận nhà cung cấp API (Mục 7) và Danh mục đóng 8 thuật toán tự viết (Mục 8). Mọi đề xuất thuật toán mới bắt buộc phải qua Architect phê duyệt.", "Mục 7, 8"),
        ("R7", "Không xây dựng nhiều nền tảng riêng biệt gây tốn nguồn lực", "Duy trì duy nhất một codebase React chạy Responsive Web + PWA. Khi cần đưa lên Store sẽ đóng gói bằng Capacitor từ cùng codebase, không viết native riêng.", "Mục 4.3")
    ]
    t_r = doc.add_table(rows=8, cols=4)
    format_table(t_r, [Inches(0.6), Inches(2.3), Inches(2.8), Inches(0.8)], ["ID", "Yêu cầu / Ràng buộc", "Quyết định Thiết kế Đáp ứng", "Mục"], r_data)

    # ==================== MỤC 3: NGUYÊN TẮC KIẾN TRÚC ====================
    doc.add_page_break()
    style_heading(doc, "3. Bảy Nguyên Tắc Kiến Trúc Cốt Lõi", 1)
    
    p = doc.add_paragraph()
    p.add_run("Mọi quyết định thiết kế và mã nguồn phát triển trong dự án bắt buộc phải tuân thủ nghiêm ngặt 7 nguyên tắc kỹ thuật sau:")

    principles = [
        ("1. API-first:", "Mọi năng lực có nhà cung cấp bên ngoài (STT, TTS, LLM, Vision) đều được gọi qua Gateway SaaS. Dự án không tự huấn luyện và không tự host mô hình AI lớn trong giai đoạn MVP."),
        ("2. Client mỏng - Zero Secret Key:", "Trình duyệt và ứng dụng di động chỉ giao tiếp duy nhất với Gateway. Mọi API Key bí mật bắt buộc phải nằm ở biến môi trường server."),
        ("3. Tự viết có kiểm soát:", "Chỉ tự viết thuật toán khi không có API thương mại đáp ứng, và chỉ nằm trong danh mục đóng 8 thuật toán ở Mục 8."),
        ("4. Hướng năng lực (Capability-based):", "Mã nguồn gọi theo tên năng lực trừu tượng (stt.transcribe, tts.synthesize), không gọi trực tiếp tên hãng. Cho phép hoán đổi nhà cung cấp bằng biến môi trường."),
        ("5. Hợp đồng đi trước (Contract-first):", "Lược đồ Zod và OpenAPI nằm tại packages/contracts. Đội ngũ Frontend làm việc trên Mock Server ngay từ ngày đầu tiên, Backend triển khai song song."),
        ("6. Đầu ra LLM luôn có cấu trúc JSON:", "Đầu ra của LLM bắt buộc phải có JSON Schema và được xác thực tự động ở Gateway trước khi gửi tới UI. Phía UI tuyệt đối không render HTML thô do LLM sinh ra."),
        ("7. Độc lập triển khai (Independent Deploy):", "Mỗi Remote MFE được build và deploy hoàn toàn độc lập, chỉ chia sẻ các thư viện singleton tối thiểu (React, React Router, TanStack Query, UI kit, Contracts).")
    ]
    for p_title, p_desc in principles:
        p_item = doc.add_paragraph()
        p_item.add_run(f"• {p_title} ").bold = True
        p_item.add_run(p_desc)

    # ==================== MỤC 4: KIẾN TRÚC TỔNG THỂ VÀ TECH STACK ====================
    doc.add_page_break()
    style_heading(doc, "4. Kiến trúc Tổng thể và Tech Stack Dự án", 1)
    
    style_heading(doc, "4.1 Sơ đồ Phân tầng Hệ thống & Bản đồ 23 Mẫu GoF", 2)
    p = doc.add_paragraph()
    p.add_run("Hình 4.1 minh họa kiến trúc phân tầng hoàn chỉnh của hệ thống. Sơ đồ thể hiện rõ 3 tầng: Client Shell + 6 Remote MFE, SaaS Gateway (Node.js/Fastify) và Dịch vụ Đám mây bên thứ ba:")

    img_file = os.path.join(BASE_DIR, "diagram_architecture_gof.png")
    if os.path.exists(img_file):
        p_img = doc.add_paragraph()
        p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
        doc.add_picture(img_file, width=Inches(6.5))
        p_cap = doc.add_paragraph()
        p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        rc = p_cap.add_run("Hình 4.1: Sơ đồ Kiến trúc Phân tầng Hệ thống và Bản đồ Tích hợp 23 Mẫu Thiết kế GoF")
        rc.font.size = Pt(8)
        rc.font.italic = True
        rc.font.color.rgb = RGBColor(0x64, 0x74, 0x8B)

    style_heading(doc, "4.2 Luồng một Lượt Hội thoại Giọng nói (Voice Turn Lifecycle)", 2)
    p = doc.add_paragraph()
    p.add_run("Chu trình một lượt hội thoại âm thanh diễn ra qua 6 bước tuần tự với ngân sách độ trễ nghiêm ngặt:\n")
    p.add_run("1. Thu âm Client: ").bold = True
    p.add_run("Client ghi âm định dạng PCM 16kHz mono bằng AudioWorklet (tránh khác biệt codec giữa trình duyệt) và đóng gói WAV.\n")
    p.add_run("2. Gửi yêu cầu: ").bold = True
    p.add_run("Client gửi yêu cầu POST /v1/chat/turn (kèm token xác thực). Gateway kiểm tra hạn mức quota và kích thước tệp âm thanh.\n")
    p.add_run("3. Nhận dạng STT: ").bold = True
    p.add_run("Gateway gọi STT Provider ➔ transcript được đẩy ngay về Client qua Server-Sent Events (SSE) để hiển thị tức thì.\n")
    p.add_run("4. Xử lý LLM: ").bold = True
    p.add_run("Gateway gọi LLM Streaming với Prompt theo trình độ và chế độ. LLM trả luồng JSON gồm: text, chip sửa lỗi và khối UI Blocks.\n")
    p.add_run("5. Tổng hợp TTS sớm: ").bold = True
    p.add_run("Gateway cắt câu ngay khi có dấu câu, gọi TTS Provider (hoặc lấy từ Cache S3) và đẩy audio về Client theo từng câu để phát sớm.\n")
    p.add_run("6. Hiển thị UI: ").bold = True
    p.add_run("Client phát âm thanh, hiển thị transcript và dựng các khối UI động qua Registry. Gateway lưu phiên và cập nhật thẻ SRS.\n")

    add_callout(doc,
        "Ngân sách độ trễ mục tiêu (Latency Budget): STT ≤ 1.5 giây, LLM token đầu tiên ≤ 1.5 giây, TTS câu đầu tiên ≤ 1.0 giây; tổng thời gian từ lúc thả nút mic đến khi phát ra âm thanh đầu tiên p50 ≤ 4.0 giây (p95 ≤ 8.0 giây).",
        title="NGÂN SÁCH ĐỘ TRỄ VOICE TURN"
    )

    style_heading(doc, "4.3 Chiến lược Một Codebase: Web Responsive, PWA và Mobile App", 2)
    p = doc.add_paragraph()
    p.add_run("• Web Responsive là sản phẩm cốt lõi; công nghệ PWA (cài đặt lên màn hình chính) đem lại trải nghiệm tương đương ứng dụng bản địa.\n")
    p.add_run("• Khi BA yêu cầu xuất hiện trên Google Play Store hoặc Apple App Store: Sử dụng công cụ Capacitor đóng gói trực tiếp từ bản web. Chi phí phát sinh chỉ bao gồm cấu hình, ký số và kiểm thử thiết bị.\n")
    p.add_run("• Dự án không dùng React Native / Expo nhằm loại bỏ gánh nặng bảo trì nền tảng thứ hai và tránh xung đột kiến trúc Module Federation.")

    style_heading(doc, "4.4 Bảng Phân Tầng Tech Stack Cốt Lõi", 2)
    core_tech_data = [
        ("Frontend", "React 18 / 19 + TypeScript, Vite, Module Federation (@module-federation/vite)", "Nếu Spike S6 thấy plugin Vite không ổn định sẽ chuyển sang Rspack."),
        ("UI & Styling", "Tailwind CSS + Headless UI (Radix UI / shadcn/ui), packages/ui", "Rút ngắn thời gian dựng giao diện; Design Tokens do M3 sở hữu."),
        ("State & Data", "TanStack Query (server state), Zustand (UI state), React Router", "Chia sẻ dạng singleton giữa Host Shell và các Remote MFE."),
        ("Biểu đồ & DSP", "Canvas / SVG cho Pitch Visualizer; Web Worker trích xuất cao độ F0", "Không dùng các thư viện biểu đồ quá nặng để tiết kiệm bộ nhớ."),
        ("Đa ngôn ngữ", "i18next; giao diện tiếng Anh, nội dung tiếng Việt chuẩn hóa NFC", "Đảm bảo hiển thị chính xác toàn bộ dấu thanh tiếng Việt."),
        ("PWA & Mobile", "vite-plugin-pwa; Capacitor (đóng gói ứng dụng di động)", "Chạy tốt trên Chrome, Safari iOS và thiết bị Android thực tế."),
        ("Backend Gateway", "Node.js LTS + TypeScript + Fastify, Zod validation, Pino logger", "Hiệu năng xử lý cao gấp 2-3 lần Express; giữ nguyên nguyên tắc Mục 3."),
        ("Dữ liệu & Cache", "PostgreSQL (Supabase/Managed), Drizzle ORM; Redis; Object Storage S3", "Quản lý dữ liệu người dùng, quota hạn mức và bộ nhớ đệm âm thanh."),
        ("Hạ tầng Cloud", "Docker; Frontend tĩnh CDN (Cloudflare Pages/Vercel); Gateway Cloud Run", "Chạy tối thiểu 2 instances, có health check và secrets manager."),
        ("Kiểm thử & QA", "Vitest, React Testing Library, Playwright E2E, MSW/Prism mock", "Mỗi thành viên tự viết test cho module phụ trách theo chuẩn DoD.")
    ]
    t_core = doc.add_table(rows=11, cols=3)
    format_table(t_core, [Inches(1.5), Inches(3.2), Inches(1.8)], ["Phân Tầng", "Công Nghệ Đề Xuất", "Ghi Chú Kỹ Thuật"], core_tech_data)

    style_heading(doc, "4.5 Bảng Tra Cứu Toàn Bộ Tech Stack & Liên Kết Tài Liệu Chính Thức", 2)
    p = doc.add_paragraph()
    p.add_run("Bảng bên dưới tổng hợp đầy đủ 35+ công nghệ của dự án kèm gói thư viện NPM và đường dẫn tài liệu chính thức (Official Documentation):")

    ts_all = [
        ("Frontend", "React 18 / 19", "react, react-dom", "https://react.dev/"),
        ("Frontend", "TypeScript", "typescript", "https://www.typescriptlang.org/docs/"),
        ("Frontend", "Vite", "vite", "https://vite.dev/guide/"),
        ("Frontend", "Module Federation", "@module-federation/vite", "https://module-federation.io/"),
        ("Frontend", "Tailwind CSS", "tailwindcss, postcss, autoprefixer", "https://tailwindcss.com/docs"),
        ("Frontend", "Radix UI & shadcn/ui", "@radix-ui/react-*", "https://ui.shadcn.com/docs"),
        ("Frontend", "TanStack Query", "@tanstack/react-query", "https://tanstack.com/query/latest"),
        ("Frontend", "Zustand (State)", "zustand", "https://zustand.docs.pmnd.rs/"),
        ("Frontend", "React Router", "react-router-dom", "https://reactrouter.com/"),
        ("Frontend", "i18next (Đa ngữ)", "i18next, react-i18next", "https://react.i18next.com/"),
        ("Frontend", "PWA Plugin", "vite-plugin-pwa", "https://vite-pwa-org.netlify.app/"),
        ("Frontend", "Capacitor Mobile", "@capacitor/core, @capacitor/cli", "https://capacitorjs.com/docs"),
        ("Frontend", "Lucide Icons", "lucide-react", "https://lucide.dev/"),
        ("Frontend", "Chart.js", "chart.js", "https://www.chartjs.org/docs/latest/"),

        ("Audio DSP", "Web Audio API", "Web API Trình duyệt", "https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API"),
        ("Audio DSP", "AudioWorklet (16kHz)", "Web API Trình duyệt", "https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet"),
        ("Audio DSP", "YIN Pitch Algorithm", "pitch-detection", "https://github.com/ashok-khanna/pitch-detection"),

        ("Backend", "Node.js LTS", "node.js runtime engine", "https://nodejs.org/docs/latest/api/"),
        ("Backend", "Fastify Framework", "fastify, @fastify/cors", "https://fastify.dev/docs/latest/"),
        ("Backend", "Zod Validation", "zod, fastify-type-provider-zod", "https://zod.dev/"),
        ("Backend", "Pino Logger", "pino, pino-pretty", "https://getpino.io/"),
        ("Backend", "Rate Limit & Quota", "@fastify/rate-limit, ioredis", "https://github.com/fastify/fastify-rate-limit"),

        ("Database", "PostgreSQL", "postgres (native driver)", "https://www.postgresql.org/docs/"),
        ("Database", "Drizzle ORM", "drizzle-orm, drizzle-kit", "https://orm.drizzle.team/docs/overview"),
        ("Database", "Supabase", "@supabase/supabase-js", "https://supabase.com/docs"),
        ("Database", "Redis (Cache & Quota)", "ioredis", "https://upstash.com/docs/redis/overall/getstarted"),
        ("Storage", "Cloudflare R2 (S3 API)", "@aws-sdk/client-s3", "https://developers.cloudflare.com/r2/"),

        ("AI - LLM", "Google Gemini 1.5 Flash", "@google/genai", "https://ai.google.dev/gemini-api/docs"),
        ("AI - LLM", "OpenAI GPT-4o-mini", "openai", "https://platform.openai.com/docs/guides/text-generation"),
        ("AI - STT", "Google Cloud Speech", "@google-cloud/speech", "https://cloud.google.com/speech-to-text/docs"),
        ("AI - STT/TTS", "Azure Speech SDK", "microsoft-cognitiveservices-speech-sdk", "https://learn.microsoft.com/en-us/azure/ai-services/speech-service/"),
        ("AI - TTS", "Google Cloud TTS", "@google-cloud/text-to-speech", "https://cloud.google.com/text-to-speech/docs"),

        ("Tooling", "Turborepo & PNPM", "turbo, pnpm workspaces", "https://turbo.build/repo/docs"),
        ("Testing", "Vitest & Playwright", "vitest, @playwright/test, msw", "https://vitest.dev/ · https://playwright.dev/"),
        ("Deployment", "Docker & Cloud Run", "docker, gcloud CLI", "https://docs.docker.com/ · https://cloud.google.com/run/docs")
    ]
    t_ts_all = doc.add_table(rows=len(ts_all)+1, cols=4)
    format_table(t_ts_all, [Inches(1.1), Inches(1.8), Inches(1.8), Inches(1.8)], ["Phân Tầng", "Công Nghệ / Dịch Vụ", "Gói NPM / Lệnh Cài Đặt", "Tài Liệu Chính Thức"], ts_all)

    style_heading(doc, "4.6 Bản Đồ Tích Hợp Đủ 23 Mẫu Thiết Kế GoF", 2)
    p = doc.add_paragraph()
    p.add_run("Bảng bên dưới thể hiện vị trí triển khai cụ thể của toàn bộ 23 mẫu thiết kế Gang of Four (GoF) trong mã nguồn monorepo của dự án:")

    gof_data = [
        ("Khởi tạo 1", "Abstract Factory", "apps/gateway/src/providers/factory.ts", "Khởi tạo họ bộ điều hợp AI tương thích (STT, TTS, LLM) theo biến môi trường."),
        ("Khởi tạo 2", "Factory Method", "packages/shared/src/drills/DrillFactory.ts", "Khởi tạo đối tượng bài tập thích ứng (Quiz, Điền từ, Ghép câu) theo khóa type."),
        ("Khởi tạo 3", "Builder", "packages/prompts/src/PromptBuilder.ts", "Lắp ráp prompt nhiều tầng (Persona Bé Cu Tít + Level CEFR + Kịch bản) và AgentMessage."),
        ("Khởi tạo 4", "Singleton", "apps/host-shell/src/bus/EventBus.ts", "Duy trì duy nhất một thực thể Event Bus phía Client và Connection Pool phía Gateway."),
        ("Khởi tạo 5", "Prototype", "packages/content/src/scenarios/ScenarioPrototype.ts", "Nhân bản nhanh kịch bản hội thoại mẫu (Đi chợ, Quán phở) để tùy biến cho người học."),
        
        ("Cấu trúc 6", "Adapter", "apps/gateway/src/adapters/ (Stt, Tts)", "Chuẩn hóa API của Google Cloud, Azure, VBEE về chung giao diện SttProvider, TtsProvider."),
        ("Cấu trúc 7", "Facade", "apps/gateway/src/routes/chat.ts", "Gom chuỗi gọi STT, LLM Streaming và phát TTS sớm thành một endpoint /v1/chat/turn."),
        ("Cấu trúc 8", "Composite", "apps/host-shell/src/components/AgentUI/BlockTree.tsx", "Tổ chức các khối giao diện UI động thành cây phân cấp, xử lý đồng nhất khối đơn và khối lồng."),
        ("Cấu trúc 9", "Decorator", "apps/gateway/src/middleware/ (Auth, Quota, Log)", "Bọc các route handler để bổ sung kiểm tra token, kiểm soát hạn mức quota và log chi phí."),
        ("Cấu trúc 10", "Bridge", "packages/audio-dsp/src/audio/AudioCaptureBridge.ts", "Tách trừu tượng thu âm khỏi nền tảng thực thi (Web Audio API vs Capacitor Native Plugin)."),
        ("Cấu trúc 11", "Proxy", "apps/gateway/src/cache/TTSCacheProxy.ts", "Kiểm tra cache S3 cho file âm thanh TTS trước khi gọi API trả phí, tiết kiệm 60% chi phí."),
        ("Cấu trúc 12", "Flyweight", "packages/content/src/pitch/PitchReferenceFlyweight.ts", "Chia sẻ dữ liệu đường contour chuẩn 6 thanh và kho thẻ văn hóa tĩnh dùng chung."),

        ("Hành vi 13", "Strategy", "packages/audio-dsp/src/pitch/PitchStrategy.ts", "Hoán đổi thuật toán trích xuất F0 giữa YIN (chuẩn xác) và McLeod (nhẹ) theo CPU máy."),
        ("Hành vi 14", "Observer", "apps/host-shell/src/bus/EventBus.ts", "Phát tín hiệu cho sự kiện liên remote (session.started, attempt.completed) và sóng F0 tới Canvas."),
        ("Hành vi 15", "Chain of Resp.", "apps/gateway/src/pipeline/RequestPipeline.ts", "Chuỗi xử lý yêu cầu tuần tự và chuỗi kiểm tra ngữ pháp câu A8 (Từ điển ➔ Luật ➔ LLM)."),
        ("Hành vi 16", "Command", "apps/host-shell/src/commands/UIBlockCommand.ts", "Đóng gói thao tác click trên UI Block thành Command Object, hỗ trợ Retry và lưu vết."),
        ("Hành vi 17", "State", "apps/mfe-conversation/src/state/TurnStateMachine.ts", "Quản lý vòng đời lượt thoại: IDLE ➔ RECORDING ➔ UPLOADING ➔ STREAMING ➔ PLAYING."),
        ("Hành vi 18", "Template Method", "apps/gateway/src/services/assessment/", "Định hình khung quy trình chấm phát âm A3: Chuẩn hóa NFC ➔ So khớp từ ➔ So contour ➔ Điểm."),
        ("Hành vi 19", "Mediator", "apps/host-shell/src/mediator/ShellMediator.ts", "Host Shell điều phối dữ liệu giữa 6 Remote MFE, triệt tiêu phụ thuộc import chéo."),
        ("Hành vi 20", "Iterator", "packages/shared/src/srs/SRSIterator.ts", "Duyệt qua danh sách thẻ từ vựng cần ôn theo thuật toán SM-2 mà không lộ cấu trúc bảng."),
        ("Hành vi 21", "Interpreter", "packages/content/src/honorifics/HonorificInterpreter.ts", "Diễn giải biểu thức đại từ xưng hô (Tuổi, Giới, Thứ bậc, Bối cảnh) ra cặp từ xưng hô chuẩn."),
        ("Hành vi 22", "Visitor", "apps/host-shell/src/protocol/BlockVisitor.ts", "Duyệt cây UI Block để làm sạch mã độc (Sanitizer) và thu thập thống kê (Analytics)."),
        ("Hành vi 23", "Memento", "apps/mfe-practice/src/sentence/SentenceBuilderMemento.ts", "Lưu ảnh chụp trạng thái vị trí các đốt tre từ ngữ, cung cấp tính năng Undo/Redo khi ghép câu.")
    ]
    t_gof = doc.add_table(rows=24, cols=4)
    format_table(t_gof, [Inches(1.2), Inches(1.3), Inches(2.2), Inches(1.8)], ["Nhóm & STT", "Tên Mẫu Thiết Kế", "Vị Trí Triển Khai", "Bài Toán & Vai Trò"], gof_data)

    # ==================== MỤC 5: THIẾT KẾ MICRO FRONTEND VÀ AGENT UI PROTOCOL ====================
    doc.add_page_break()
    style_heading(doc, "5. Thiết kế Micro Frontend và Agent UI Protocol", 1)
    
    style_heading(doc, "5.1 Phân bổ Host Shell và 6 Remote MFE", 2)
    p = doc.add_paragraph()
    p.add_run("12 màn hình được nhóm thành 6 remote theo miền chức năng, khớp với sở hữu của từng thành viên (Mục 14). Mỗi màn hình là một module được expose độc lập (./ChatCanvas, ./PitchVisualizer, ...):")

    mfe_data = [
        ("host-shell", "Routing, layout, auth session, theme, i18n, Remote Loader, Agent UI Registry, Event Bus, Error Boundary", "M3 (Frontend Lead)", "Không chứa bất kỳ logic nghiệp vụ màn hình nào."),
        ("mfe-conversation", "M1. Chat Canvas, M7. Roleplay Simulator", "M3", "Dùng chung các hook cốt lõi: useRecorder, useAgentStream."),
        ("mfe-practice", "M5. Adaptive Drill Cards, M8. Sentence Builder", "M4", "Quản lý tương tác làm bài tập và ghép câu đốt tre trúc."),
        ("mfe-learner", "M9. Analytics Dashboard, M11. Adaptive Onboarding, M12. AI Preferences", "M4", "Xử lý hồ sơ người học, xếp lớp thích ứng và cấu hình cá nhân."),
        ("mfe-speech-lab", "M2. Pitch Visualizer, M6. Dialect Switcher", "M5", "Sử dụng thư viện tính toán packages/audio-dsp trên Web Worker."),
        ("mfe-vision", "M4. AR Camera Surface", "M5", "Giao diện mở camera chụp ảnh gốc đa, gửi Vision API dán nhãn."),
        ("mfe-knowledge", "M3. Honorific Matrix, M10. Culture Guide", "M2", "Giao diện hiển thị ma trận xưng hô và cẩm nang văn hóa.")
    ]
    t_mfe = doc.add_table(rows=8, cols=4)
    format_table(t_mfe, [Inches(1.5), Inches(2.5), Inches(1.1), Inches(1.4)], ["Ứng Dụng", "Màn Hình / Thành Phần Chứa", "Sở Hữu", "Ghi Chú Kỹ Thuật"], mfe_data)

    style_heading(doc, "5.2 Quy tắc Chia sẻ và Giao tiếp Liên Remote", 2)
    p = doc.add_paragraph()
    p.add_run("• Thư viện Singleton dùng chung: ").bold = True
    p.add_run("react, react-dom, react-router-dom, @tanstack/react-query, zustand, @app/ui, @app/contracts. Toàn bộ phiên bản được khóa chặt ở package.json gốc; lệch phiên bản sẽ làm đỏ quy trình CI.\n")
    p.add_run("• Nguyên tắc không import chéo: ").bold = True
    p.add_run("Các Remote MFE tuyệt đối không import trực tiếp lẫn nhau. Mọi giao tiếp liên remote bắt buộc đi qua: (1) URL/Route parameters, (2) Event Bus có kiểu định nghĩa sẵn (session.started, attempt.completed, agent.ui.action, prefs.changed), (3) Lát cắt Store chỉ-đọc (read-only state slice) do Host Shell cấp phát.\n")
    p.add_run("• Cô lập lỗi (Error Isolation): ").bold = True
    p.add_run("Một remote gặp sự cố không được phép làm sập toàn bộ ứng dụng. Host Shell bọc mỗi remote bằng React Error Boundary chuyên biệt và hiển thị màn hình fallback thân thiện.\n")
    p.add_run("• Cấu hình Runtime linh hoạt: ").bold = True
    p.add_run("URL của các remote được đọc từ file manifest (mf-manifest.json) thông qua biến môi trường, cho phép cập nhật phiên bản remote mà không cần build lại Host Shell.")

    style_heading(doc, "5.3 Giao Thức Giao Diện Tương Tác AI (Agent UI Protocol)", 2)
    p = doc.add_paragraph()
    p.add_run("Đây là cơ chế giải quyết yêu cầu 'UI Interactive cho AI Agent'. AI Agent (LLM qua Gateway) tuyệt đối không trả HTML thô mà trả về danh sách các khối giao diện UI có cấu trúc JSON; Host Shell sẽ ánh xạ khối tới component tương ứng nhờ Agent UI Registry:")

    add_code_block(doc,
        "// Cấu trúc thông điệp chuẩn của Agent (AgentMessage)\n"
        "interface AgentMessage {\n"
        "  id: string;\n"
        "  role: 'agent' | 'user';\n"
        "  text: string;\n"
        "  corrections?: { from: string; to: string; note: string }[];\n"
        "  blocks?: Block[]; // Tối đa 4 khối giao diện trong một lượt thoại\n"
        "  meta: { level: number; latencyMs: number; promptVersion: string };\n"
        "}\n\n"
        "interface Block {\n"
        "  id: string;\n"
        "  type: BlockType;\n"
        "  props: Record<string, unknown>;\n"
        "}\n\n"
        "type BlockType =\n"
        "  | 'pitch_compare'   // So sánh đường contour F0 của 6 thanh\n"
        "  | 'drill_card'       // Thẻ bài tập trắc nghiệm / điền từ\n"
        "  | 'honorific_hint'  // Gợi ý đại từ xưng hô theo ngữ cảnh\n"
        "  | 'dialect_compare' // Bảng đối chiếu từ vựng 3 miền\n"
        "  | 'culture_card'    // Thẻ kiến thức phong tục tập quán\n"
        "  | 'sentence_frame'  // Khung kéo thả token ghép câu đốt tre\n"
        "  | 'audio_clip'      // Đoạn âm thanh nghe mẫu kèm nút phát\n"
        "  | 'quick_replies';  // Danh sách nút bấm gợi ý phản hồi nhanh\n\n"
        "// Hành động của người dùng trên khối được gửi lại Gateway như một lượt mới:\n"
        "emit('agent.ui.action', { blockId, action: 'answer' | 'replay' | 'open', payload });"
    )

    p = doc.add_paragraph()
    p.add_run("• Cơ chế Registry: ").bold = True
    p.add_run("Host Shell ánh xạ từng BlockType tới component được lazy-load từ Remote MFE tương ứng (ví dụ: pitch_compare ➔ mfe-speech-lab/blocks/PitchCompare). Nếu gặp type lạ, tự động hiển thị khối text dự phòng.\n")
    p.add_run("• Bảo mật dữ liệu giao diện: ").bold = True
    p.add_run("Gateway chỉ cho phép các BlockType nằm trong Whitelist, kiểm tra toàn bộ props bằng Zod schema, giới hạn độ dài, nghiêm cấm mã HTML, và URL tệp âm thanh chỉ thuộc domain lưu trữ nội bộ (ngăn chặn tấn công XSS và Prompt Injection).")

    # ==================== MỤC 6: THIẾT KẾ GATEWAY SAAS ====================
    doc.add_page_break()
    style_heading(doc, "6. Thiết kế Gateway SaaS", 1)
    
    style_heading(doc, "6.1 Trách nhiệm và Pipeline Xử lý Yêu cầu", 2)
    p = doc.add_paragraph()
    p.add_run("Gateway vận hành đúng mô hình SaaS Online: Nhận yêu cầu từ client ➔ gửi tới API bên ngoài ➔ nhận phản hồi ➔ chuẩn hóa dữ liệu ➔ trả về client. Gateway hoàn toàn Stateless và không chứa mô hình AI.\n")
    p.add_run("Pipeline 7 bước cho mỗi request: ").bold = True
    p.add_run("Tạo requestId ➔ Xác thực JWT ➔ Kiểm tra Rate Limit & Quota người dùng ➔ Kiểm tra hợp lệ dữ liệu (Zod) ➔ Route Handler ➔ Gọi Provider Adapter (kèm Timeout, Retry, Circuit Breaker) ➔ Chuẩn hóa kết quả ➔ Ghi log chi phí ➔ Trả response.")

    style_heading(doc, "6.2 Giao diện Bộ Điều Hợp Năng Lực (Provider Adapters)", 2)
    p = doc.add_paragraph()
    p.add_run("Các giao diện adapter được thiết kế theo năng lực trừu tượng, cách ly hoàn toàn mã nguồn khỏi tên thương hiệu nhà cung cấp:")

    add_code_block(doc,
        "interface SttProvider {\n"
        "  transcribe(audio: Buffer, options: { lang: 'vi'; hints?: string[] }): Promise<{\n"
        "    text: string;\n"
        "    words?: { w: string; start: number; end: number }[];\n"
        "    confidence?: number;\n"
        "  }>;\n"
        "}\n\n"
        "interface TtsProvider {\n"
        "  synthesize(text: string, options: { voiceId: string; speed: number }): Promise<{\n"
        "    audio: Buffer;\n"
        "    durationMs: number;\n"
        "  }>;\n"
        "  listVoices(): Promise<Voice[]>;\n"
        "}\n\n"
        "interface LlmProvider {\n"
        "  json<T>(req: LlmRequest, schema: ZodType<T>): Promise<T>;\n"
        "  stream(req: LlmRequest): AsyncIterable<LlmChunk>; // Hỗ trợ cả Vision đa phương thức\n"
        "}"
    )

    style_heading(doc, "6.3 Danh sách 14 Endpoint REST Chuẩn Hóa (/v1)", 2)
    p = doc.add_paragraph()
    p.add_run("Toàn bộ API được gom theo chuẩn RESTful với tiền tố /v1 và định dạng JSON thống nhất:")

    ep_data = [
        ("POST /v1/chat/turn (SSE)", "{sessionId, mode, scenarioId?, input:{text|audioId}} ➔ Luồng SSE: transcript, token, blocks, audio, done", "STT, LLM, TTS", "M1"),
        ("POST /v1/speech/transcribe", "audio (multipart/form-data) ➔ {text, words, confidence}", "STT", "M1"),
        ("POST /v1/speech/synthesize", "{text, voiceId, speed, dialect?} ➔ {audioUrl, durationMs, cached}", "TTS + S3 Cache", "M1"),
        ("GET /v1/speech/voices", "?dialect= ➔ Danh sách giọng đọc theo miền", "TTS", "M1"),
        ("POST /v1/speech/assess", "{audioId, referenceText} ➔ {transcript, diff[], score, hints[]}", "STT + A3", "M2"),
        ("GET /v1/pitch/reference/:id", "?dialect= ➔ Mảng cao độ chuẩn (semitone[])", "A1 tính sẵn từ TTS", "M5"),
        ("POST /v1/vision/label", "{image} ➔ {items: [{vi, en, box?}]}", "LLM Vision", "M1"),
        ("POST /v1/practice/generate", "{type, topic, level, count} ➔ Drill[]", "LLM (JSON Schema)", "M2"),
        ("POST /v1/practice/grade", "{drillId, answer} ➔ {correct, feedback, explanation}", "So khớp NFC + LLM", "M2"),
        ("POST /v1/sentence/check", "{tokens[], itemId?} ➔ {valid, errors[], hint}", "A8 + LLM", "M2"),
        ("POST /v1/placement/next", "{sessionId, answer?} ➔ Câu hỏi kế tiếp hoặc {level}", "A5", "M2"),
        ("POST /v1/culture/ask", "{question} ➔ {answer, sources[]}", "LLM + Thẻ văn hóa", "M2"),
        ("GET /v1/content/:type", "ETag ➔ JSON nội dung (xưng hô, phương ngữ, kịch bản)", "Kho nội dung tĩnh", "M2"),
        ("GET·POST /v1/srs/*", "GET /srs/due (thẻ đến hạn) · POST /srs/reviews (lưu ôn tập)", "A4 (SM-2)", "M2"),
        ("GET /v1/analytics/summary", "?range= ➔ Chỉ số học tập (Streak, chính xác, kỹ năng)", "Tổng hợp SQL", "M2"),
        ("GET·PUT /v1/preferences", "Cấu hình: voice, speed, dialect, mức sửa lỗi, persona", "PostgreSQL", "M1")
    ]
    t_ep = doc.add_table(rows=17, cols=4)
    format_table(t_ep, [Inches(1.8), Inches(2.8), Inches(1.2), Inches(0.7)], ["Endpoint (/v1)", "Dữ Liệu Vào ➔ Ra", "Provider / Thuật Toán", "Chủ"], ep_data)

    p = doc.add_paragraph()
    p.add_run("• Cấu trúc phản hồi chuẩn: ").bold = True
    p.add_run("Thành công: { data, meta: { requestId } }. Lỗi: { error: { code, message, retryable }, meta }.\n")
    p.add_run("• Bảng mã lỗi chuẩn: ").bold = True
    p.add_run("AUTH_REQUIRED (401), QUOTA_EXCEEDED (429), VALIDATION_FAILED (400), PROVIDER_TIMEOUT (504), PROVIDER_UNAVAILABLE (503), CONTENT_REJECTED (422).")

    style_heading(doc, "6.4 Bộ Nhớ Đệm, Hạn Mức Quota và Kiểm Soát Chi Phí", 2)
    p = doc.add_paragraph()
    p.add_run("• Cơ chế Cache TTS: ").bold = True
    p.add_run("Khóa cache sinh theo mã băm: hash(text + voiceId + speed + providerVersion), lưu file MP3 trên Cloudflare R2 / S3. Toàn bộ nội dung tĩnh (từ vựng, câu mẫu) được tạo trước hàng loạt, tiết kiệm 60% chi phí phát sinh.\n")
    p.add_run("• Cơ chế Cache LLM: ").bold = True
    p.add_run("Không cache hội thoại mở tự do; chỉ cache bài tập sinh sẵn theo bộ ba (type, topic, level). Mọi prompt có version, ghi nhận số token và chi phí thực tế cho từng lượt.\n")
    p.add_run("• Quota hạn mức hàng ngày: ").bold = True
    p.add_run("Thiết lập ngân sách theo người dùng: 600 giây STT/ngày, 15,000 ký tự TTS/ngày, 100,000 token LLM/ngày, 20 ảnh Vision/ngày. Khi chạm trần, trả mã QUOTA_EXCEEDED và hiển thị thông báo nhẹ nhàng. Tích hợp công tắc ngắt khẩn cấp (Kill Switch) theo từng năng lực.")

    style_heading(doc, "6.5 Vận Hành Hệ Thống (Operations)", 2)
    p = doc.add_paragraph()
    p.add_run("Gateway chạy dưới dạng Docker container trên nền tảng Google Cloud Run (tối thiểu 2 instances). Tích hợp endpoint /healthz cho Liveness và Readiness check (kiểm tra kết nối Database và Provider AI chính). Ghi log định dạng JSON có cấu trúc bằng Pino, báo cáo lỗi qua Sentry và trực quan hóa chi phí API hàng ngày.")

    # ==================== MỤC 7: MA TRẬN NHÀ CUNG CẤP API ====================
    doc.add_page_break()
    style_heading(doc, "7. Ma Trận Nhà Cung Cấp API (API Provider Matrix)", 1)
    
    p = doc.add_paragraph()
    p.add_run("Toàn bộ các nhà cung cấp bên dưới là ứng viên và được kiểm chứng thực tế trong Spike tuần 1 (Mục 15). Nhờ tầng Adapter, việc thay đổi hoặc tráo đổi nhà cung cấp hoàn toàn không ảnh hưởng tới phía Client:")

    prov_matrix = [
        ("STT Tiếng Việt", "Chat, Roleplay, Onboarding, Chấm phát âm", "VBEE STT; Google Cloud STT (vi-VN); Azure Speech (vi-VN)", "Đo tỷ lệ lỗi từ (WER) trên 30 câu của ≥ 3 người nước ngoài; đo độ trễ p50; kiểm tra mốc thời gian từng từ (word timestamps)."),
        ("TTS Tiếng Việt", "Tất cả các màn hình có âm thanh phát ra", "VBEE; Azure Neural TTS (vi-VN); Google Cloud TTS; ElevenLabs", "Đánh giá chất lượng và độ tự nhiên của đủ 3 giọng Bắc / Trung / Nam; hỗ trợ thẻ SSML điều chỉnh tốc độ; hạn mức gọi và giá thành."),
        ("LLM Hội thoại & Sinh bài", "Chat, Roleplay, Drill, Sentence Builder, Culture Q&A", "Google Gemini 1.5 Flash (chính); OpenAI GPT-4o-mini (dự phòng)", "Chất lượng tiếng Việt tự nhiên; tuân thủ JSON Schema tuyệt đối; độ trễ token đầu tiên ≤ 1.5s; chi phí tính trên 1 triệu token."),
        ("Vision AI", "M4. AR Camera Surface", "Google Gemini 1.5 Flash (Vision); GPT-4o-mini", "Khả năng nhận diện đồ vật đời thường ở Việt Nam (nón lá, phở, xe máy); trả nhãn tiếng Việt đúng dấu; độ trễ xử lý ≤ 2.5s/ảnh."),
        ("Chấm phát âm", "M1. Chat, M2. Pitch Visualizer", "Azure Pronunciation Assessment vs A3 + A2 tự viết", "Tài liệu Azure hiện chỉ hỗ trợ tính năng chấm phát âm chuyên sâu cho tiếng Anh (en-US). Nếu Spike S1 không dùng được cho vi-VN ➔ kích hoạt A3 + A2."),
        ("Kiểm tra ngữ pháp", "M5. Drill, M8. Sentence Builder", "LLM chấm theo Rubric kết hợp thuật toán A8", "Đảm bảo tính nhất quán của barem điểm (Rubric); gắn cờ needs_review cho các câu phức tạp do LLM chấm."),
        ("Auth, DB & Storage", "Toàn bộ hệ thống", "Supabase (PostgreSQL, Auth, Storage) hoặc PostgreSQL + Redis + S3", "Chốt phương án lưu trữ và hạ tầng ở Tuần 1 (M1 chủ trì).")
    ]
    t_prov = doc.add_table(rows=8, cols=4)
    format_table(t_prov, [Inches(1.2), Inches(1.5), Inches(1.8), Inches(2.0)], ["Năng Lực AI", "Màn Hình Ứng Dụng", "Các Ứng Viên Đề Xuất", "Tiêu Chí Kiểm Chứng Thực Tế"], prov_matrix)

    # ==================== MỤC 8: DANH MỤC THUẬT TOÁN TỰ VIẾT ====================
    doc.add_page_break()
    style_heading(doc, "8. Danh mục 8 Thuật toán Tự viết (A1 – A8)", 1)
    
    p = doc.add_paragraph()
    p.add_run("Đây là danh sách đóng 8 thuật toán đặc thù tiếng Việt không có API thương mại thay thế. Tuyệt đối không tự ý thêm thuật toán mới nếu chưa được Lead Dev và Architect phê duyệt:")

    alg_data_full = [
        ("A1", "Trích xuất cao độ F0 và chuẩn hóa (YIN/McLeod, lọc trung vị, sửa nhảy quãng tám)", "PCM 16 kHz ➔ Contour Semitone so với chính người nói", "Client (Web Worker) + Node.js (tính mẫu)", "M5", "Cao"),
        ("A2", "So sánh Contour thanh điệu: DTW + tương quan Pearson; phân loại 6 thanh bằng luật", "2 Contour ➔ Điểm tương đồng 0-100, thanh dự đoán", "Client (packages/audio-dsp)", "M5", "Cao"),
        ("A3", "Chấm phát âm tổng hợp: So khớp từ Unicode NFC (phân biệt lỗi dấu) kết hợp A2", "Transcript, câu mẫu, similarity ➔ Điểm số, gợi ý sửa", "Gateway SaaS", "M2", "Trung bình"),
        ("A4", "Lặp lại ngắt quãng SuperMemo-2 (SM-2)", "Chất lượng nhớ 0-5 ➔ Khoảng cách ngày, ease, dueAt", "Shared Package (Client + Server)", "M2", "Thấp"),
        ("A5", "Kiểm tra xếp lớp thích ứng (Staircase / Elo thích ứng hội tụ sau 8-12 câu)", "Chuỗi câu trả lời ➔ Câu hỏi tiếp theo, Level CEFR 1-6", "Gateway SaaS", "M2", "Trung bình"),
        ("A6", "Bộ luật đại từ xưng hô tiếng Việt (Bảng luật 20 cặp quan hệ gia đình & xã hội)", "Tuổi, Giới tính, Quan hệ ➔ Cặp đại từ + Ví dụ", "Client + JSON nội dung", "M2", "Thấp"),
        ("A7", "Ánh xạ từ vựng phương ngữ Bắc - Trung - Nam + chọn giọng TTS theo miền", "Từ chuẩn, miền ➔ Biến thể phương ngữ, audio", "JSON nội dung + Gateway", "M2, M5", "Thấp"),
        ("A8", "Kiểm tra trật tự câu ghép đốt tre: So khớp mảng token; ngoài tập mẫu ➔ gọi LLM", "Mảng token ➔ Hợp lệ / Vị trí lỗi / Gợi ý ngữ pháp", "Gateway SaaS", "M2", "Thấp")
    ]
    t_alg = doc.add_table(rows=9, cols=6)
    format_table(t_alg, [Inches(0.5), Inches(2.2), Inches(1.5), Inches(1.1), Inches(0.5), Inches(0.7)], ["Mã", "Tên Thuật Toán & Nguyên Lý", "Vào ➔ Ra", "Nơi Chạy", "Chủ", "Độ Khó"], alg_data_full)

    style_heading(doc, "8.1 Quy Trình Pitch Visualizer (Vùng Rủi Ro Kỹ Thuật Cao Nhất)", 2)
    p = doc.add_paragraph()
    p.add_run("Quy trình xử lý âm thanh trong Pitch Visualizer được thiết kế 4 bước nghiêm ngặt:\n")
    p.add_run("1. Thu âm & Tiền xử lý: ").bold = True
    p.add_run("Thu âm PCM 16 kHz ➔ cắt bỏ đoạn im lặng bằng ngưỡng năng lượng RMS ➔ tính F0 theo từng khung 25ms (A1) ➔ chạy bộ lọc trung vị (Median Filter) 3 điểm để khử nhiễu và thuật toán sửa lỗi nhảy quãng tám (Octave Jump Correction).\n")
    p.add_run("2. Chuẩn hóa Cao độ Cá nhân: ").bold = True
    p.add_run("Quy đổi F0 từ thang Hz sang Semitone dựa trên cao độ trung bình của chính người học (semitone = 12 * log2(F0 / F0_mean)); co giãn độ dài thời gian về cùng số lượng điểm mẫu chuẩn.\n")
    p.add_run("3. Nạp Đường Contour Tham Chiếu: ").bold = True
    p.add_run("Đường contour chuẩn được Gateway tính sẵn từ giọng đọc TTS chuẩn theo từng miền (job tính trước) kết hợp ghi âm mẫu của người bản ngữ trong đội ngũ.\n")
    p.add_run("4. So Khớp & Phản Hồi: ").bold = True
    p.add_run("So khớp hai đường contour bằng thuật toán Dynamic Time Warping (DTW) kết hợp hệ số tương quan Pearson (A2). Phân loại 6 thanh điệu tiếng Việt theo độ dốc và điểm cực trị. Giao diện ưu tiên hiển thị trực quan chồng đè hai đường sóng; điểm số đóng vai trò gợi ý khích lệ.\n")
    
    add_callout(doc,
        "Giới hạn ngữ âm bắt buộc phải minh bạch với người dùng: Thanh ngã (~) và thanh nặng (.) trong tiếng Việt phụ thuộc chặt chẽ vào hiện tượng thắt thanh quản (creaky voice / glottalization), yếu tố mà thuật toán trích xuất F0 không thể hiện toàn vẹn. Nếu Spike S4 gặp khó khăn trong việc tách biệt hai thanh này, hệ thống sẽ giữ tính năng ở mức trực quan hóa hình học + nghe so sánh, không chấm điểm số.",
        title="GIỚI HẠN VẬT LÝ ÂM THANH CẦN LƯU Ý"
    )

    # ==================== MỤC 9: ĐẶC TẢ 12 MÀN HÌNH ====================
    doc.add_page_break()
    style_heading(doc, "9. Đặc tả Chi tiết 12 Màn hình MVP", 1)
    
    style_heading(doc, "9.1 Ánh xạ Kỹ thuật 12 Màn hình", 2)
    scr_map = [
        ("1", "Chat Canvas", "mfe-conversation", "/v1/chat/turn, /v1/speech/*", "A3 (tùy chọn)", "STT, LLM, TTS", "M3 (FE), M1 (BE)"),
        ("2", "Pitch Visualizer", "mfe-speech-lab", "/v1/pitch/reference, /v1/speech/synthesize", "A1, A2", "TTS", "M5"),
        ("3", "Honorific Matrix", "mfe-knowledge", "/v1/content/honorifics", "A6", "TTS (audio mẫu)", "M2"),
        ("4", "AR Camera Surface", "mfe-vision", "/v1/vision/label, /v1/speech/synthesize", "—", "LLM Vision, TTS", "M5 (FE), M1 (BE)"),
        ("5", "Adaptive Drill Cards", "mfe-practice", "/v1/practice/generate, /v1/practice/grade", "A4 (đẩy vào SRS)", "LLM", "M4 (FE), M2 (BE)"),
        ("6", "Dialect Switcher", "mfe-speech-lab", "/v1/content/dialects, /v1/speech/synthesize", "A7", "TTS", "M5 (FE), M2 (Content)"),
        ("7", "Roleplay Simulator", "mfe-conversation", "/v1/chat/turn (mode roleplay), /v1/content/scenarios", "—", "STT, LLM, TTS", "M3 (FE), M1 (BE)"),
        ("8", "Sentence Builder", "mfe-practice", "/v1/sentence/check", "A8", "LLM", "M4 (FE), M2 (BE)"),
        ("9", "Analytics & SRS", "mfe-learner", "/v1/srs/*, /v1/analytics/summary", "A4", "—", "M4 (FE), M2 (BE)"),
        ("10", "Culture Guide", "mfe-knowledge", "/v1/content/culture, /v1/culture/ask", "—", "LLM + Thẻ văn hóa", "M2"),
        ("11", "Adaptive Onboarding", "mfe-learner", "/v1/placement/next, /v1/preferences", "A5", "STT, LLM", "M4 (FE), M2 (BE)"),
        ("12", "AI Preferences", "mfe-learner", "/v1/speech/voices, /v1/preferences", "—", "TTS", "M4 (FE), M1 (BE)")
    ]
    t_sm = doc.add_table(rows=13, cols=7)
    format_table(t_sm, [Inches(0.4), Inches(1.4), Inches(1.3), Inches(1.4), Inches(0.6), Inches(0.7), Inches(0.7)], ["#", "Màn Hình", "Remote", "Endpoint Chính", "Thuật Toán", "API Ngoài", "Chủ"], scr_map)

    style_heading(doc, "9.2 Mức Cam Kết (Bắt buộc) và Mức Mở Rộng (Nâng cao)", 2)
    p = doc.add_paragraph()
    p.add_run("Mức Cam kết là phạm vi bắt buộc hoàn thành ở Tuần 6. Mức Mở rộng chỉ thực hiện khi còn dư công trong Tuần 7–8:")

    scr_scope = [
        ("1", "Chat Canvas", "Nhập text & nói; multi-turn có ngữ cảnh N lượt; streaming; chip sửa lỗi; render ≥ 4 loại UI Blocks.", "Tóm tắt phiên; sửa lỗi inline; tìm trong lịch sử."),
        ("2", "Pitch Visualizer", "Ghi âm, vẽ chồng 2 đường contour người học và mẫu cho 6 thanh và 20 từ/cụm; nghe mẫu; điểm DTW.", "30 từ/cụm; tự nhận dạng thanh của người học; phản hồi bằng lời."),
        ("3", "Honorific Matrix", "Chọn tuổi/giới/quan hệ/trang trọng ➔ Cặp đại từ + ví dụ + audio; 20 cặp quan hệ.", "30 cặp; quiz nhanh; LLM giải thích tình huống."),
        ("4", "AR Camera Surface", "Mở camera chụp ảnh khung ➔ gửi Vision AI dán nhãn từ vựng, nghe phát âm, lưu từ vào SRS.", "Overlay liên tục thời gian thực; theo dõi vật thể 3D."),
        ("5", "Adaptive Drill Cards", "5 dạng bài (trắc nghiệm, điền từ, nghe chọn, ghép từ, đọc lại) sinh bằng Gemini schema; chấm rubric.", "Điều chỉnh độ khó theo thời gian thực."),
        ("6", "Dialect Switcher", "Đối chiếu Bắc/Trung/Nam cho 30 từ/cụm; nghe giọng đọc theo từng miền.", "40 từ/cụm; chuyển cả hội thoại sang phương ngữ."),
        ("7", "Roleplay Simulator", "4 kịch bản (chợ quê trả giá, hỏi đường, quán phở, làm quen) có mục tiêu và tổng kết lỗi.", "6 kịch bản (thêm taxi, khách sạn); chấm điểm nhiệm vụ."),
        ("8", "Sentence Builder", "Kéo-thả token đốt tre trúc, kiểm tra và giải thích lỗi trật tự câu (60 câu có đáp án).", "100 câu; LLM sinh câu mới theo chủ đề."),
        ("9", "Analytics & SRS", "Streak, thời gian học, độ chính xác theo kỹ năng, thẻ đến hạn ôn tập SM-2 đồng bộ server.", "Dự báo tiến độ CEFR; chế độ ôn tập offline."),
        ("10", "Culture Guide", "20 thẻ phong tục tập quán, kiêng kỵ dân gian; hỏi đáp LLM dựa trên thẻ liên quan.", "25 thẻ; gợi ý thẻ văn hóa theo bối cảnh Roleplay."),
        ("11", "Adaptive Onboarding", "Hỏi mục tiêu, tiếng mẹ đẻ, phương ngữ; kiểm tra thích ứng 8-12 câu ➔ xếp level 1-6.", "Đánh giá chi tiết phát âm ngay trong bài kiểm tra."),
        ("12", "AI Preferences", "Chọn giọng, tốc độ nói, phương ngữ, mức sửa lỗi, đổi persona Bé Cu Tít; nghe thử giọng.", "Cá nhân hóa tự động theo hành vi học.")
    ]
    t_ss = doc.add_table(rows=13, cols=4)
    format_table(t_ss, [Inches(0.4), Inches(1.4), Inches(2.7), Inches(2.0)], ["#", "Màn Hình", "Mức Cam Kết (Bắt Buộc - Tuần 6)", "Mức Mở Rộng (Tuần 7-8)"], scr_scope)

    # ==================== MỤC 10: MÔ HÌNH DỮ LIỆU ====================
    doc.add_page_break()
    style_heading(doc, "10. Mô hình Dữ liệu Hệ thống", 1)
    
    p = doc.add_paragraph()
    p.add_run("Hệ thống cơ sở dữ liệu quan hệ PostgreSQL được thiết kế chặt chẽ qua 9 thực thể chính:")

    db_tables = [
        ("users, profiles", "id (UUID), email, locale, native_lang, level (1-6), goal, target_dialect, onboarding_done", "Quản lý danh tính và hồ sơ học tập. Auth do nhà cung cấp quản lý."),
        ("preferences", "user_id, voice_id, speed, dialect, correction_level, persona, explain_lang", "Cấu hình cá nhân hóa trợ lý Bé Cu Tít của từng người học."),
        ("sessions, messages", "sessions(id, user_id, mode, scenario_id, started_at, ended_at); messages(id, session_id, role, text, blocks_json, audio_id, created_at)", "Lưu lịch sử hội thoại. Blocks lưu nguyên dạng JSON Schema đã qua validate."),
        ("attempts", "id, user_id, item_type, item_id, input_ref, score, detail_json, created_at", "Lưu vết từng lần làm bài hoặc phát âm, phục vụ thống kê Analytics."),
        ("srs_cards, srs_reviews", "cards(id, user_id, item_ref, ease, interval_days, repetitions, due_at); reviews(card_id, quality, reviewed_at)", "Thuật toán A4 chạy trên cả client và server; server là nguồn chuẩn."),
        ("placement_sessions", "id, user_id, answers_json, estimate, finished_at", "Lưu vết quá trình kiểm tra thích ứng xếp lớp A5."),
        ("content_items", "id, type, dialect, payload_json, version, reviewed_by", "Kho nội dung (xưng hô, văn hóa, phương ngữ). Phải có người bản ngữ duyệt."),
        ("audio_assets", "id, hash, kind, storage_key, expires_at", "kind = tts_cache hoặc learner_audio. File audio người học có thời hạn TTL."),
        ("usage_logs", "id, user_id, capability, provider, units, cost_estimate, latency_ms, created_at", "Theo dõi hạn mức quota người dùng và hạch toán chi phí API hàng ngày.")
    ]
    t_db = doc.add_table(rows=10, cols=3)
    format_table(t_db, [Inches(1.5), Inches(3.2), Inches(1.8)], ["Tên Bảng CSDL", "Các Trường Dữ Liệu Chính", "Ý Nghĩa Nghiệp Vụ"], db_tables)

    style_heading(doc, "10.1 Mã Mẫu Drizzle ORM Schema (TypeScript)", 2)
    p = doc.add_paragraph()
    p.add_run("Mã nguồn định nghĩa bảng users và srsCards trong packages/contracts/src/db/schema.ts:")

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
        "  ease: integer('ease').default(250), // Hệ số 2.50\n"
        "  intervalDays: integer('interval_days').default(1),\n"
        "  repetitions: integer('repetitions').default(0),\n"
        "  dueAt: timestamp('due_at').notNull()\n"
        "});"
    )

    # ==================== MỤC 11: BẢO MẬT, RIÊNG TƯ, CHI PHÍ ====================
    doc.add_page_break()
    style_heading(doc, "11. Bảo Mật, Quyền Riêng Tư và Kiểm Soát Chi Phí", 1)
    
    sec_points = [
        ("Quản lý Khóa Bí mật:", "API Key của bên thứ ba tuyệt đối chỉ lưu ở biến môi trường server (Gateway). Không bao giờ bundle vào mã nguồn Client. Thực hiện xoay vòng khóa định kỳ."),
        ("Bảo vệ Dữ liệu Giọng nói:", "Giọng nói được xếp loại dữ liệu cá nhân. Bắt buộc có màn hình thỏa thuận chấp thuận ghi âm (Consent) ở bước Onboarding; file ghi âm thô của người học có thời hạn tự hủy (TTL) 30 ngày; người dùng có quyền chủ động xóa dữ liệu bất kỳ lúc nào."),
        ("Phòng chống Lạm dụng:", "Áp dụng cơ chế Rate Limiting phân tầng theo IP và UserId; giới hạn kích thước tệp âm thanh (≤ 5MB) và ảnh chụp (≤ 4MB); kiểm soát chặt quota theo ngày (Mục 6.4)."),
        ("An toàn LLM & Ngăn chặn Prompt Injection:", "Prompt hệ thống được cô lập hoàn toàn khỏi nội dung người dùng nhập; đầu ra LLM bắt buộc kiểm tra theo Zod schema; chỉ cho phép render các khối UI nằm trong Whitelist; tích hợp bộ lọc từ ngữ độc hại trong kịch bản Roleplay."),
        ("Kiểm soát Truy cập & CORS/CSP:", "Cấu hình CORS nghiêm ngặt chỉ chấp nhận domain của hệ thống; thiết lập chính sách Content Security Policy (CSP) chặt chẽ; phân quyền dữ liệu cô lập theo user_id ở tất cả các câu truy vấn SQL."),
        ("Chiến lược Tối ưu Chi phí:", "Tận dụng tối đa TTS Cache S3; sử dụng mô hình LLM nhanh/rẻ (Gemini 1.5 Flash) cho các tác vụ thường nhật; giới hạn độ dài token sinh ra; giám sát chi phí liên tục qua dashboard hàng ngày.")
    ]
    for sp_title, sp_desc in sec_points:
        p_item = doc.add_paragraph()
        p_item.add_run(f"• {sp_title} ").bold = True
        p_item.add_run(sp_desc)

    # ==================== MỤC 12: YÊU CẦU PHI CHỨC NĂNG ====================
    doc.add_page_break()
    style_heading(doc, "12. Yêu Cầu Phi Chức Năng (Non-Functional Requirements)", 1)
    
    p = doc.add_paragraph()
    p.add_run("Các chỉ số bên dưới là ngưỡng kỹ thuật mục tiêu được xác nhận tại mốc kiểm thử Vertical Slice (Tuần 3):")

    nfr_data = [
        ("Độ trễ Voice Turn", "p50 ≤ 4.0 giây tới âm thanh đầu tiên; p95 ≤ 8.0 giây", "Ghi log độ trễ chi tiết từng bước; k6 kiểm thử tải nhẹ."),
        ("Độ trễ Text Turn", "Token đầu tiên xuất hiện ≤ 1.5 giây", "Ghi log thời gian SSE."),
        ("Phân tích Pitch F0 Client", "≤ 1.0 giây cho đoạn âm thanh ≤ 5.0 giây", "Đo benchmark trên thiết bị di động tầm trung."),
        ("Tốc độ Tải trang ban đầu", "LCP ≤ 2.5 giây trên mạng 4G; Remote MFE lazy-load", "Lighthouse CI tự động."),
        ("Tương thích Trình duyệt", "Chrome, Edge, Safari (iOS 16+), Firefox: 2 bản mới nhất", "Playwright; kiểm thử tay trên iPhone và Android thật."),
        ("Độ Sẵn sàng Hệ thống", "99.5% trong giai đoạn thử nghiệm; suy giảm nhẹ khi lỗi", "Health check /healthz, giám sát tự động."),
        ("Tiêu chuẩn Trợ năng", "Mức WCAG AA cơ bản (độ tương phản, bàn phím, nhãn)", "Kiểm tra bằng công cụ tự động kết hợp thủ công."),
        ("Chuẩn hóa Văn bản i18n", "UI tiếng Anh; tiếng Việt chuẩn hóa Unicode NFC", "Bộ kiểm thử Unit Test cho chuỗi ký tự tiếng Việt.")
    ]
    t_nfr = doc.add_table(rows=9, cols=3)
    format_table(t_nfr, [Inches(1.8), Inches(2.7), Inches(2.0)], ["Hạng Mục Đo Lường", "Mục Tiêu Đề Xuất", "Phương Pháp Kiểm Tra"], nfr_data)

    # ==================== MỤC 13: CÔNG CỤ, AI AGENTS HỖ TRỢ VÀ QUY TRÌNH PHÁT TRIỂN ====================
    doc.add_page_break()
    style_heading(doc, "13. Công cụ, AI Agents Hỗ trợ và Quy trình Phát triển", 1)
    
    style_heading(doc, "13.1 Ứng Dụng AI Agents Hỗ Trợ Lập Trình", 2)
    p = doc.add_paragraph()
    p.add_run("• Tài liệu hướng dẫn cho AI Agents (AGENTS.md): ").bold = True
    p.add_run("Đặt tại gốc repo quy định rõ: cấu trúc monorepo, quy ước đặt tên, cách chạy test, 7 nguyên tắc Mục 3, danh mục đóng 8 thuật toán tự viết, quy tắc nghiêm cấm import chéo giữa các remote.\n")
    p.add_run("• Tự động sinh mã nguồn từ Contract: ").bold = True
    p.add_run("packages/contracts (OpenAPI + Zod) tự động sinh Client API có kiểu tĩnh và Mock Server (MSW). Cả AI Agent và lập trình viên đều bắt đầu làm việc từ Contract.\n")
    p.add_run("• Thư viện Prompt có phiên bản (packages/prompts): ").bold = True
    p.add_run("Quản lý toàn bộ prompt của Chat, Roleplay, Drill, Rubric chấm, Culture Q&A; mỗi prompt đều có bộ dữ liệu mẫu (test cases) để kiểm thử hồi quy.\n")
    p.add_run("• Kiểm soát chất lượng mã nguồn: ").bold = True
    p.add_run("Mọi Pull Request (PR) đều bắt buộc có người thật review; hệ thống CI tự động chạy Typecheck, Lint, Unit Test và Contract Test.")

    style_heading(doc, "13.2 Quy Trình Kỹ Thuật (Development Workflow)", 2)
    p = doc.add_paragraph()
    p.add_run("• Mô hình Trunk-based Development: Nhánh ngắn, PR nhỏ gọn, tích hợp liên tục vào nhánh main.\n")
    p.add_run("• Hệ thống CI (GitHub Actions): Chạy tự động Lint, Typecheck, Test, Build từng Remote, kiểm tra tính toàn vẹn của thư viện Singleton và E2E Smoke Test bằng Playwright.\n")
    p.add_run("• Phân tách môi trường: Dev (Mock Server), Staging (API thật với hạn mức thấp), Production.\n")
    p.add_run("• Quy trình sửa đổi Contract: Bắt buộc cập nhật packages/contracts trước, được Lead Dev duyệt mới triển khai song song cho Frontend và Backend.")

    # ==================== MỤC 14: PHÂN VAI 5 THÀNH VIÊN VÀ LỘ TRÌNH 8 TUẦN ====================
    doc.add_page_break()
    style_heading(doc, "14. Phân vai 5 Thành viên và Lộ trình 8 Tuần", 1)
    
    style_heading(doc, "14.1 Phân Bổ Vai Trò và Quyền Sở Hữu", 2)
    roles_data = [
        ("M1", "Backend / Gateway & Nền tảng", "apps/gateway: pipeline, auth, quota, adapters STT/TTS/LLM/Vision, SSE chat, /speech/*, /vision/*, /preferences; Docker, CI/CD, deploy, giám sát chi phí", "Backend của 1, 4, 7, 12", "—"),
        ("M2", "Fullstack: Học tập & Nội dung", "/practice, /sentence, /placement, /srs, /analytics, /content, /culture, /speech/assess; packages/prompts, packages/content; mfe-knowledge", "3, 10 (FE+BE); BE của 5, 8, 9, 11; nội dung 6", "A3, A4, A5, A6, A7, A8"),
        ("M3", "Frontend: Shell & Hội thoại", "host-shell, packages/ui (design tokens), Agent UI Registry, hook useRecorder, useAgentStream; mfe-conversation; i18n, PWA", "1, 7", "—"),
        ("M4", "Frontend: Luyện tập & Người học", "mfe-practice, mfe-learner", "5, 8, 9, 11, 12", "Dùng A4, A5 qua API"),
        ("M5", "Frontend: Âm thanh & Thị giác", "packages/audio-dsp, mfe-speech-lab, mfe-vision, /pitch/reference (job tạo contour)", "2, 4, 6", "A1, A2")
    ]
    t_roles = doc.add_table(rows=6, cols=5)
    format_table(t_roles, [Inches(0.6), Inches(1.5), Inches(2.4), Inches(1.1), Inches(0.9)], ["Mã", "Vai Trò", "Mã Nguồn Sở Hữu", "Màn Hình", "Thuật Toán"], roles_data)

    p = doc.add_paragraph()
    p.add_run("• Phụ thuộc chính giữa các vai: ").bold = True
    p.add_run("M3, M4, M5 chỉ phụ thuộc vào Contract và Mock Server (M1, M2 bàn giao cuối Tuần 1). M3 bàn giao sớm Shell và useRecorder ở Tuần 2 cho M4, M5. M5 phụ thuộc kết quả Spike S4 để chốt phạm vi Pitch Visualizer.\n")
    p.add_run("• Điều phối nội dung tiếng Việt: ").bold = True
    p.add_run("M2 chủ trì; mỗi thành viên biên soạn phần nội dung cho màn hình của mình (2-3 ngày công), người bản ngữ duyệt (reviewed_by) trước khi bật lên giao diện.")

    style_heading(doc, "14.2 Lộ Trình 8 Tuần & Các Cổng Kiểm Soát (Gate G1 - G5)", 2)
    roadmap_data = [
        ("Tuần 1", "Kickoff; chốt contract Zod; monorepo; mock server; 6 spike (Mục 15); nhận wireframe từ BA.", "Gate G1: Go/No-Go chốt nhà cung cấp STT/TTS/LLM; Pitch khả thi hay chỉ hiển thị.", "Cả đội; Lead Dev"),
        ("Tuần 2", "Gateway khung + Auth + DB; Host Shell và 6 remote chạy trống; useRecorder; prototype F0; UI kit.", "12 route điều hướng trơn tru; thu âm + STT chạy được.", "M1, M3, M5"),
        ("Tuần 3", "Vertical slice: Hoàn thiện 1 lượt Voice Turn nói ➔ nghe hoàn chỉnh; đo độ trễ; practice/generate; đọc F0 thật.", "Vertical slice chạy thành công trên Web, iPhone và Android thật.", "M1, M3, M2"),
        ("Tuần 4", "Chat Canvas hoàn chỉnh; Roleplay kịch bản; Drill Cards; Sentence Builder; so sánh contour A2; nội dung đợt 1.", "Drill và Sentence Builder chơi được; Chat ổn định.", "M3, M4, M2, M5"),
        ("Tuần 5", "Onboarding + Placement (A5); Honorific Matrix; Dialect Switcher; AR Camera; SRS (A4).", "12 màn hình đạt gần đủ mức Cam kết.", "M4, M2, M5"),
        ("Tuần 6", "Analytics UI; Culture Guide; AI Preferences; hoàn thiện toàn bộ giao diện; triển khai Staging.", "Gate G4 Feature Freeze: Đủ 12 màn hình đạt mức Cam kết.", "Cả đội"),
        ("Tuần 7", "Tích hợp toàn diện, kiểm thử liên thông, sửa lỗi, tối ưu độ trễ & chi phí, rà soát bảo mật, UAT cùng BA.", "Không còn lỗi tồn đọng mức Critical / High.", "Cả đội; Lead Dev, BA"),
        ("Tuần 8", "Thực hiện tính năng Mở rộng theo thứ tự ưu tiên (Mục 14.5); hardening; tài liệu vận hành; đóng gói phát hành.", "Gate G5: Release Candidate hoàn chỉnh.", "Cả đội")
    ]
    t_road = doc.add_table(rows=9, cols=4)
    format_table(t_road, [Inches(0.8), Inches(2.7), Inches(1.8), Inches(1.2)], ["Tuần", "Trọng Tâm Triển Khai", "Mốc / Cổng Kiểm Soát (Gate)", "Chủ Đạo"], roadmap_data)

    style_heading(doc, "14.3 Cân Đối Tải & Thang Giảm Độ Sâu Khi Chậm Tiến Độ", 2)
    p = doc.add_paragraph()
    p.add_run("• Năng lực hiệu dụng: 5 người × 8 tuần × 5 ngày × 0.8 ≈ 160 ngày công. Khối lượng ước tính: M1 (36), M2 (36), M3 (38), M4 (31), M5 (35) ➔ Tổng ≈ 176 ngày công (vượt khoảng 10%). Chênh lệch được giải quyết bằng AI Agents hỗ trợ và thang giảm độ sâu:\n")
    p.add_run("1. Thang 1: ").bold = True
    p.add_run("Cắt bỏ toàn bộ tính năng ở cột Mở rộng (đã tách độc lập khỏi cột Cam kết).\n")
    p.add_run("2. Thang 2: ").bold = True
    p.add_run("Giảm số lượng nội dung: Sentence Builder 60 ➔ 40 câu; Honorific 20 ➔ 15 cặp; Culture 20 ➔ 15 thẻ; Dialect 30 ➔ 20 từ; Pitch 20 ➔ 15 cụm; Roleplay 4 ➔ 3 kịch bản.\n")
    p.add_run("3. Thang 3: ").bold = True
    p.add_run("AR Camera chỉ chụp 1 khung ảnh (bỏ lấy mẫu liên tục); Analytics chỉ giữ 3 chỉ số cốt lõi; Preferences chỉ giữ giọng, tốc độ, phương ngữ.\n")
    p.add_run("4. Thang 4: ").bold = True
    p.add_run("Pitch Visualizer bỏ tính điểm số, chỉ giữ hiển thị sóng chồng đè và nghe phát âm mẫu (nếu Spike S4 không đạt). Tuyệt đối không bỏ màn hình nào.")

    # ==================== MỤC 15: SPIKE TUẦN 1, RỦI RO VÀ QUYẾT ĐỊNH ADR ====================
    doc.add_page_break()
    style_heading(doc, "15. Spike Tuần 1, Ma Trận Rủi Ro và Quyết Định Kiến Trúc (ADR)", 1)
    
    style_heading(doc, "15.1 Danh Mục 6 Spike Tuần 1 (Cổng Gate G1)", 2)
    spikes = [
        ("S1", "STT nào dùng tốt cho người nước ngoài? Có API chấm phát âm vi-VN không?", "Thử nghiệm 30 câu với ≥ 3 người nước ngoài; đo WER, độ trễ, chi phí; kiểm tra tính năng chấm phát âm vi-VN của Azure Speech.", "M1, M2", "Ngày 4"),
        ("S2", "TTS nào tự nhiên, có đủ giọng Bắc / Trung / Nam?", "Liệt kê danh sách giọng theo miền, nghe thử nghiệm, kiểm tra thẻ SSML tốc độ và chi phí.", "M1", "Ngày 3"),
        ("S3", "Chọn LLM nào làm mô hình chính và dự phòng?", "Thử nghiệm 50 câu mẫu tiếng Việt: ngữ pháp, độ tự nhiên, độ ổn định JSON Schema, độ trễ, giá.", "M2", "Ngày 4"),
        ("S4", "F0 có phân biệt được 6 thanh điệu không? Dùng thư viện có sẵn hay tự viết YIN?", "Vẽ contour âm tiết 'ma' 6 thanh từ TTS và 2 người thật; thử 2 thư viện JS; tiêu chí: 4/6 thanh phân biệt rõ bằng mắt.", "M5", "Ngày 5"),
        ("S5", "Vision AI gắn nhãn tiếng Việt đồ vật đời thường có chính xác không?", "Thử nghiệm 30 ảnh chụp đồ vật Việt Nam; kiểm tra độ chính xác của nhãn và dấu thanh tiếng Việt.", "M1, M5", "Ngày 4"),
        ("S6", "Module Federation (Vite) + PWA + Mic/Camera có chạy tốt trên iOS Safari không?", "Dựng Host + 2 Remote mẫu; kiểm thử ghi âm 16kHz và camera trên iPhone và Android thật.", "M3", "Ngày 5")
    ]
    t_spk = doc.add_table(rows=7, cols=5)
    format_table(t_spk, [Inches(0.6), Inches(2.3), Inches(2.3), Inches(0.8), Inches(0.5)], ["ID", "Câu Hỏi Cần Trả Lời", "Phương Pháp & Tiêu Chí", "Chủ Trì", "Hạn"], spikes)

    style_heading(doc, "15.2 Ma Trận Quản Trị Rủi Ro Kỹ Thuật", 2)
    risks = [
        ("Chất lượng STT thấp với giọng người nước ngoài", "Cao", "Spike S1; cho phép nhập bàn phím thay mic; hiển thị transcript để người học tự sửa.", "M1"),
        ("Không có API chấm phát âm; F0 không tách được thanh", "Cao", "Spike S4; hạ xuống mức hiển thị sóng không chấm điểm; giải thích rõ giới hạn trong UI.", "M5"),
        ("Độ trễ Voice Turn vượt quá mục tiêu (> 4.0s)", "Trung bình - Cao", "Streaming SSE, cắt câu phát TTS sớm, cache S3, dùng mô hình LLM siêu nhẹ.", "M1"),
        ("Thiếu hụt nhân lực so với khối lượng 12 màn hình", "Trung bình - Cao", "Áp dụng thang giảm độ sâu (Mục 14.5); M4 san sẻ việc cho M2/M3; Contract-first.", "Lead Dev"),
        ("Module Federation trên Vite / iOS WebView không ổn định", "Trung bình", "Spike S6; phương án dự phòng chuyển sang Rspack hoặc Dynamic Import tại build time.", "M3"),
        ("Chi phí API vượt ngân sách dự toán", "Trung bình", "Quota hạn mức theo người dùng, cache TTS S3, dashboard theo dõi chi phí, Kill Switch.", "M1"),
        ("Nội dung tiếng Việt hoặc phương ngữ bị sai lệch", "Trung bình", "Quy trình reviewed_by; chỉ bật nội dung đã được người bản ngữ phê duyệt.", "M2"),
        ("Vi phạm quy định riêng tư về dữ liệu âm thanh giọng nói", "Trung bình", "Thỏa thuận Consent rõ ràng, TTL 30 ngày tự hủy, xóa theo yêu cầu của người dùng.", "Lead Dev, BA")
    ]
    t_rsk = doc.add_table(rows=9, cols=4)
    format_table(t_rsk, [Inches(1.8), Inches(1.0), Inches(2.8), Inches(0.9)], ["Rủi Ro Tiềm Ẩn", "Mức Độ", "Giải Pháp Giảm Thiểu", "Người Phụ Trách"], risks)

    style_heading(doc, "15.3 Tóm Tắt 8 Quyết Định Kiến Trúc Trọng Yếu (ADR-01 đến ADR-08)", 2)
    adrs = [
        ("ADR-01", "Một codebase Web + PWA; Capacitor nếu lên Store", "Đáp ứng ràng buộc 'không đa nền tảng'; tối ưu nguồn lực bảo trì duy nhất một bản.", "BA bắt buộc tính năng native đặc thù."),
        ("ADR-02", "Module Federation: 1 Host Shell + 6 Remote MFE", "Đáp ứng kiến trúc Micro Frontend; phân chia module tương ứng năng lực 5 người.", "Thành viên thấy quá phức tạp ➔ gộp remote."),
        ("ADR-03", "Gateway Node.js/Fastify, 1 API duy nhất", "Giữ khóa bí mật tại server, tái sử dụng kiểu TypeScript, tốc độ cao gấp 2-3 lần Express.", "Lead Dev có thế mạnh công nghệ khác."),
        ("ADR-04", "Provider Adapter theo năng lực trừu tượng + Fallback", "Cho phép hoán đổi nhà cung cấp AI linh hoạt mà không ảnh hưởng phía Client.", "Không đảo ngược (nguyên tắc bắt buộc)."),
        ("ADR-05", "Trích xuất F0 trên Client; Contour mẫu tính ở Server", "Không tải file audio thô lên server để phân tích pitch, giảm độ trễ và chi phí.", "Thiết bị người dùng quá yếu ➔ chuyển tính server."),
        ("ADR-06", "LLM chấm Rubric thay vì dịch vụ ngữ pháp chuyên biệt", "Thị trường chưa có API ngữ pháp tiếng Việt chuyên biệt đã xác minh.", "Spike S3 tìm được dịch vụ ngữ pháp tốt hơn."),
        ("ADR-07", "Nội dung tĩnh lưu file JSON có version trong Git repo", "Duyệt nội dung qua Pull Request, dễ dàng rollback và theo dõi lịch sử thay đổi.", "Cần hệ thống CMS trực quan cho biên tập viên."),
        ("ADR-08", "Đầu ra LLM luôn có JSON Schema; UI không render HTML", "Ngăn chặn triệt để lỗ hổng XSS, đảm bảo dữ liệu có cấu trúc và dễ dàng kiểm thử.", "Không đảo ngược (nguyên tắc bắt buộc).")
    ]
    t_adr = doc.add_table(rows=9, cols=4)
    format_table(t_adr, [Inches(0.8), Inches(2.2), Inches(2.3), Inches(1.2)], ["Mã ADR", "Quyết Định Kiến Trúc", "Lý Do Lựa Chọn", "Điều Kiện Đảo Ngược"], adrs)

    # ==================== MỤC 16: CÂU HỎI CẦN BA VÀ LEAD DEV XÁC NHẬN ====================
    doc.add_page_break()
    style_heading(doc, "16. Tám Câu Hỏi Cần BA và Lead Dev Xác Nhận Tại Kickoff", 1)
    
    questions = [
        ("1. Ràng buộc đa nền tảng:", "BA có đồng ý với giải pháp duy nhất một codebase chạy Responsive Web + PWA không, và có bắt buộc phải đưa ứng dụng lên App Store / Google Play trong đợt này không?"),
        ("2. Phạm vi AR Camera:", "BA có chấp nhận định nghĩa 'AR' là phủ nhãn từ vựng (Overlay Labels) lên ảnh chụp/khung hình camera (Mục 9.2), không đòi hỏi bám đuổi vật thể 3D thời gian thực phức tạp không?"),
        ("3. Cấu trúc Micro Frontend:", "Kiến trúc 6 Remote MFE gom theo miền chức năng có đáp ứng đúng mong đợi của BA không, hay BA muốn phân tách mỗi màn hình là một remote riêng biệt?"),
        ("4. Bản chất điểm số phát âm:", "BA có đồng ý rằng điểm số chấm phát âm chỉ mang tính chất khích lệ, gợi ý, và đồng ý để giao diện hiển thị thông báo giải thích rõ giới hạn kỹ thuật cho người học không?"),
        ("5. Ngân sách & Lưu trữ API:", "Hạn mức ngân sách tối đa hàng tháng cho các API trả phí là bao nhiêu? Danh sách nhà cung cấp nào được ưu tiên và có cho phép dữ liệu âm thanh được gửi tới server quốc tế không?"),
        ("6. Thiết kế UI/UX & Wireframe:", "Ai sẽ là người cung cấp Wireframe và bộ thiết kế giao diện chi tiết cho 12 màn hình, thời hạn bàn giao là khi nào? Ai sẽ chủ trì nghiệm thu UAT ngoài các bài test tự động?"),
        ("7. Thẩm định nội dung Tiếng Việt:", "Ai trong đội ngũ hoặc đối tác bên ngoài sẽ đóng vai trò là người bản ngữ có chuyên môn ngôn ngữ để duyệt các bộ dữ liệu xưng hô, văn hóa, phương ngữ trước khi bật tính năng?"),
        ("8. Phê duyệt tải & Thang giảm độ sâu:", "Lead Dev có đồng ý với ước lượng tải ở Mục 14.4 tại buổi Kickoff và thống nhất áp dụng Thang giảm độ sâu tính năng ở Mục 14.5 khi xảy ra chậm trễ tiến độ không?")
    ]
    for q_title, q_desc in questions:
        p_q = doc.add_paragraph()
        p_q.add_run(f"• {q_title} ").bold = True
        p_q.add_run(q_desc)

    # ==================== PHỤ LỤC A: CẤU TRÚC REPO ====================
    doc.add_page_break()
    style_heading(doc, "Phụ lục A. Cấu trúc Kho Mã Nguồn Monorepo Đề Xuất", 1)
    
    p = doc.add_paragraph()
    p.add_run("Cấu trúc mã nguồn monorepo được khởi tạo và kiểm chứng hoàn chỉnh, sử dụng Turborepo và PNPM Workspaces:")

    add_code_block(doc,
        "vn-learning/\n"
        "├── apps/\n"
        "│   ├── host-shell/            # Shell Module Federation, Routing, Agent UI Registry (M3)\n"
        "│   ├── gateway/               # SaaS Gateway Fastify/Node.js, Adapter, Quota (M1, M2)\n"
        "│   ├── mfe-conversation/      # Remote MFE: Chat Canvas, Roleplay Simulator (M3)\n"
        "│   ├── mfe-practice/          # Remote MFE: Adaptive Drill Cards, Sentence Builder (M4)\n"
        "│   ├── mfe-learner/           # Remote MFE: Adaptive Onboarding, Analytics, Preferences (M4)\n"
        "│   ├── mfe-speech-lab/        # Remote MFE: Pitch Visualizer, Dialect Switcher (M5)\n"
        "│   ├── mfe-vision/            # Remote MFE: AR Camera Surface (M5)\n"
        "│   └── mfe-knowledge/         # Remote MFE: Honorific Matrix, Culture Guide (M2)\n"
        "├── packages/\n"
        "│   ├── contracts/             # Zod Schemas + OpenAPI + Drizzle ORM Schema\n"
        "│   ├── audio-dsp/             # Thuật toán A1 (YIN F0), A2 (DTW), AudioCaptureBridge (M5)\n"
        "│   ├── prompts/               # Thư viện Prompt có version, PromptBuilder (M2)\n"
        "│   ├── content/               # Ma trận xưng hô A6, Từ điển phương ngữ A7, Kịch bản mẫu\n"
        "│   ├── shared/                # EventBus (Singleton/Observer), Thuật toán SM-2 (A4), DrillFactory\n"
        "│   └── ui/                    # Bộ Design Tokens và UI Components dùng chung (M3)\n"
        "├── docs/                      # Toàn bộ tài liệu kỹ thuật Word, PDF, Web tương tác, sơ đồ 300 DPI\n"
        "├── .env.example               # Tệp mẫu cấu hình môi trường chuẩn cho Gateway và Cloud Services\n"
        "├── AGENTS.md                  # Bản chỉ dẫn phát triển phần mềm dành riêng cho AI Agents\n"
        "├── pnpm-workspace.yaml        # Khai báo không gian làm việc apps/* và packages/*\n"
        "└── turbo.json                 # Cấu hình pipeline biên dịch và bộ nhớ đệm Turborepo"
    )

    # ==================== PHỤ LỤC B: DEFINITION OF DONE ====================
    style_heading(doc, "Phụ lục B. Quy Chuẩn Nghiệm Thu Kỹ Thuật (Definition of Done - DoD)", 1)
    
    p = doc.add_paragraph()
    p.add_run("Mọi tính năng hoặc màn hình khi hoàn thành bắt buộc phải thỏa mãn đầy đủ 6 tiêu chuẩn nghiệm thu kỹ thuật sau mới được đóng task:")

    dods = [
        ("1. Tuân thủ Contract Tuyệt đối:", "Tính năng bắt buộc phải có đầy đủ lược đồ Zod Schema trong packages/contracts; vượt qua toàn bộ các bài kiểm thử Mock Server và Contract Tests."),
        ("2. Kiểm thử Tự động Xanh (Automated Tests Green):", "Có Unit Test độc lập cho toàn bộ logic tính toán cốt lõi và các tương tác người dùng chính; kịch bản E2E Smoke Test chạy xanh 100% trên pipeline CI của GitHub Actions."),
        ("3. Đa Nền tảng Hoạt động Ổn định:", "Vận hành mượt mà trên trình duyệt Chrome, Safari iOS và thiết bị thật Android đối với tất cả các màn hình có quyền truy cập Micro và Camera."),
        ("4. Xử lý Trạng thái Ngoại lệ Toàn diện:", "Giao diện có đầy đủ 3 trạng thái: Đang tải (Loading), Lỗi (Error) và Rỗng (Empty). Hiển thị thông báo thân thiện và gợi ý hành động khi gặp lỗi QUOTA_EXCEEDED hoặc lỗi nhà cung cấp mạng."),
        ("5. Thẩm định Tiếng Việt Chuẩn mực:", "Toàn bộ văn bản tiếng Việt hiển thị trên giao diện phải được chuẩn hóa định dạng Unicode NFC và được người bản ngữ trong đội ngũ ký duyệt (reviewed_by)."),
        ("6. Bảo mật và Tuân thủ Pháp lý:", "Tuyệt đối không để lộ API Key phía Client; không ghi log thông tin định danh cá nhân (PII); toàn bộ mã nguồn phải vượt qua phiên rà soát (Code Review) của Lead Dev.")
    ]
    for d_title, d_desc in dods:
        p_d = doc.add_paragraph()
        p_d.add_run(f"• {d_title} ").bold = True
        p_d.add_run(d_desc)

    # Save to both root and docs/
    out_master_path = os.path.join(BASE_DIR, "Bao_Cao_Thiet_Ke_Kien_Truc_Toan_Dien_TDD_UIT.docx")
    doc.save(out_master_path)
    print("SUCCESS: Master TDD Document fully generated in root directory.")
    
    docs_copy_path = os.path.join(BASE_DIR, "docs", "Bao_Cao_Thiet_Ke_Kien_Truc_Toan_Dien_TDD_UIT.docx")
    doc.save(docs_copy_path)
    print("SUCCESS: Copy saved to docs folder.")

if __name__ == '__main__':
    build_complete_document()
