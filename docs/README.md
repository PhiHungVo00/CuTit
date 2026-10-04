# 📚 Thư Mục Tài Liệu Kỹ Thuật (Documentation)
> **Dự án:** Học Tiếng Việt Cùng Bé Cu Tít (Agentic Vietnamese Learning)  
> **Môn học:** Chuyên đề Mobile & Pervasive Computing (SE405.R11 - UIT)

Thư mục này chứa toàn bộ tài liệu kiến trúc, sơ đồ kỹ thuật, công cụ trực quan hóa và kịch bản sinh tài liệu tự động của dự án.

---

## 🌟 1. Tài Liệu Chuẩn Chính Thức (Active Documents)

| Tên tệp tin | Định dạng | Mô tả nội dung |
| :--- | :--- | :--- |
| **`Bao_Cao_Thiet_Ke_Kien_Truc_Toan_Dien_TDD_UIT.docx`** | Microsoft Word (1.2 MB) | **Tài liệu đặc tả kiến trúc chuẩn (Master TDD)** gồm đầy đủ 16 mục theo chuẩn quốc tế ASD-STE100, tổng hợp toàn bộ Tech Stack, Micro Frontend, Gateway SaaS, 9 bảng Drizzle ORM, 14 API Zod schemas, 23 GoF Design Patterns và lộ trình 5 thành viên trong 8 tuần. |
| **`diagram_architecture_gof.png`** | PNG 300 DPI (4000x2400) | **Sơ đồ kiến trúc toàn cảnh 3 phân tầng** trực quan hóa toàn bộ Host Shell, 6 Micro-Frontend, Gateway SaaS, Redis, Drizzle ORM và vị trí cắm của 23 GoF Design Patterns. |
| **`interactive_architecture.html`** | Standalone HTML5 / Canvas | **Ứng dụng web mô phỏng tương tác trực quan**, cho phép kiểm thử trực tiếp thuật toán trích xuất F0 YIN, thuật toán ôn tập SM-2, máy trạng thái Voice Turn và tương tác với sơ đồ kiến trúc GoF. |
| **`02_Bao_cao_ky_thuat_TDD_UIT.pdf`** | PDF (760 KB) | Đề bài báo cáo kỹ thuật gốc đồ án SE405.R11 (UIT). |

---

## 🗂️ 2. Cấu Trúc Các Thư Mục Con

### 📁 `scripts/` (Kịch bản tự động hóa)
Chứa các kịch bản Python để tự động kết xuất sơ đồ và tài liệu Word:
- `build_complete_tdd_docx.py`: Script tự động biên dịch và tạo tệp Word `Bao_Cao_Thiet_Ke_Kien_Truc_Toan_Dien_TDD_UIT.docx`.
- `generate_clean_diagram.py`: Script sử dụng thư viện `matplotlib` và `Pillow` để vẽ sơ đồ kiến trúc 300 DPI sắc nét.

### 📁 `archive/` (Lưu trữ lịch sử)
Lưu trữ các bản thảo trung gian và tài liệu ghi chép trước khi được hợp nhất vào tài liệu TDD chính thức:
- `So_Tay_Toan_Dien_Tech_Stack_Va_Kien_Truc_He_Thong.docx`: Bản thảo sổ tay tech stack ban đầu.
- `Tai_Lieu_Thiet_Ke_Kien_Truc_He_Thong_Va_Design_Patterns.docx` & `v2.docx`: Các bản thảo sơ khởi về kiến trúc.
- `ASD_STE100_Technical_Explanation.md` & `HUONG_DAN_TECH_STACK_AI_VA_DATABASE.md`: Bản ghi chép nháp.
