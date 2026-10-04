# -*- coding: utf-8 -*-
import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches

# Ensure proper font for Vietnamese characters
plt.rcParams['font.sans-serif'] = ['Segoe UI', 'Arial', 'DejaVu Sans', 'sans-serif']
plt.rcParams['axes.unicode_minus'] = False

def create_clean_architecture_diagram(output_path):
    fig, ax = plt.subplots(figsize=(22, 16), dpi=300)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis('off')
    
    # Clean background
    fig.patch.set_facecolor('#F8FAFC')
    ax.set_facecolor('#F8FAFC')

    def add_card(x, y, w, h, ec, fc, lw=1.2, r=0.8, ls='-'):
        patch = patches.FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad={r}", ec=ec, fc=fc, lw=lw, linestyle=ls)
        ax.add_patch(patch)
        return patch

    def add_badge(x, y, w, h, text, fc, tc='#FFFFFF', fs=8):
        patch = patches.FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.25", ec="none", fc=fc)
        ax.add_patch(patch)
        ax.text(x + w/2, y + h/2, text, ha='center', va='center', fontsize=fs, fontweight='bold', color=tc, fontfamily='Segoe UI')

    # ==================== 1. TITLE HEADER ====================
    add_card(2, 92.5, 96, 5.5, ec="#4338CA", fc="#4F46E5", lw=2, r=1)
    ax.text(50, 96.0, "SƠ ĐỒ KIẾN TRÚC TỔNG THỂ & BẢN ĐỒ 23 MẪU THIẾT KẾ GoF", 
            ha='center', va='center', fontsize=17, fontweight='bold', color='#FFFFFF')
    ax.text(50, 93.8, "Ứng Dụng Học Tiếng Việt Cho Người Nước Ngoài (Agentic Vietnamese Learning · Bé Cu Tít · SE405.R11)", 
            ha='center', va='center', fontsize=11, color='#E0E7FF')

    # ==================== 2. TẦNG 1: CLIENT TIER (MICRO FRONTEND) ====================
    # Outer box: y = 47.0 to 91.0 (height 44.0)
    add_card(2, 47.0, 96, 44.0, ec="#3B82F6", fc="#EFF6FF", lw=1.8, r=0.8, ls='--')
    
    # Inner header banner for Tier 1
    add_card(3.5, 87.2, 93, 2.8, ec="none", fc="#DBEAFE", lw=0, r=0.4)
    ax.text(50, 88.6, "TẦNG 1: CLIENT BROWSER / PWA (React + Vite + Module Federation · Single Codebase)", 
            fontsize=11.5, fontweight='bold', color='#1E40AF', ha='center', va='center')

    # Host Shell Card: y = 74.5 to 86.0
    add_card(3.5, 74.5, 93, 11.5, ec="#2563EB", fc="#FFFFFF", lw=1.5, r=0.6)
    ax.text(5.5, 84.6, "HOST SHELL (apps/host-shell) - Điều phối trung tâm & Nền tảng chia sẻ", 
            fontsize=11, fontweight='bold', color='#1E3A8A', va='top')
    ax.text(5.5, 82.2, "• Core Engine: Routing, Auth Session, Theme Design Tokens, useRecorder, AudioWorklet (PCM 16kHz mono), Error Boundary", 
            fontsize=9.2, color='#1F2937', va='top')
    ax.text(5.5, 79.8, "• Giao tiếp: Typed Event Bus (session, attempt, action, prefs) | Agent UI Registry (Dynamic Block Component Resolver)", 
            fontsize=9.2, color='#1F2937', va='top')
    
    # 5 Badges for Host Shell
    h_badges = [
        ("Singleton: EventBus & DB Pool", "#10B981"),
        ("Mediator: Shell điều phối Remotes", "#8B5CF6"),
        ("Composite: Cây khối UI Block", "#F59E0B"),
        ("Visitor: Block Sanitizer & Log", "#EC4899"),
        ("Command: Đóng gói tương tác UI", "#06B6D4")
    ]
    bx = 5.5
    for b_text, b_color in h_badges:
        add_badge(bx, 75.5, 17.2, 2.3, b_text, b_color, fs=7.8)
        bx += 17.2 + 1.2

    # 6 Remote MFEs in 3 Columns x 2 Rows Grid
    remotes_config = [
        # Row 1
        {
            "x": 3.5, "y": 61.5, "w": 29.5, "h": 11.8,
            "title": "1. mfe-conversation", "color": "#BE185D", "bg": "#FDF2F8",
            "lines": ["• Chat Canvas (M1): Hội thoại giọng nói đa lượt", "• Roleplay Simulator (M7): Kịch bản chợ quê, quán phở"],
            "badges": [("State: Vòng đời hội thoại", "#BE185D"), ("Prototype: Kịch bản mẫu", "#9D174D")]
        },
        {
            "x": 35.25, "y": 61.5, "w": 29.5, "h": 11.8,
            "title": "2. mfe-practice", "color": "#047857", "bg": "#ECFDF5",
            "lines": ["• Adaptive Drill Cards (M5): 5 dạng bài thích ứng", "• Sentence Builder (M8): Ghép câu đốt tre trúc"],
            "badges": [("Factory Method: Bài tập", "#047857"), ("Memento: Undo ghép câu", "#065F46")]
        },
        {
            "x": 67.0, "y": 61.5, "w": 29.5, "h": 11.8,
            "title": "3. mfe-learner", "color": "#B45309", "bg": "#FFFBEB",
            "lines": ["• Adaptive Onboarding (M11): Đánh giá Elo 8-12 câu", "• Analytics & SRS (M9): Lịch ôn SM-2 | Preferences (M12)"],
            "badges": [("Iterator: Duyệt thẻ SM-2", "#B45309"), ("Strategy: Xếp lớp Elo", "#92400E")]
        },
        # Row 2
        {
            "x": 3.5, "y": 48.5, "w": 29.5, "h": 11.8,
            "title": "4. mfe-speech-lab", "color": "#1D4ED8", "bg": "#EFF6FF",
            "lines": ["• Pitch Visualizer (M2): Trích xuất F0, đối sánh 6 thanh", "• Dialect Switcher (M6): Phương ngữ Bắc-Trung-Nam"],
            "badges": [("Strategy: YIN/McLeod A1", "#1D4ED8"), ("Flyweight: Contour mẫu", "#1E40AF")]
        },
        {
            "x": 35.25, "y": 48.5, "w": 29.5, "h": 11.8,
            "title": "5. mfe-vision", "color": "#7E22CE", "bg": "#FAF5FF",
            "lines": ["• AR Camera Surface (M4): Quán nước gốc đa", "• Nhận diện vật thể đời thường & dán nhãn từ vựng"],
            "badges": [("Bridge: Web / Native Camera", "#7E22CE"), ("Observer: Khung hình AR", "#6B21A8")]
        },
        {
            "x": 67.0, "y": 48.5, "w": 29.5, "h": 11.8,
            "title": "6. mfe-knowledge", "color": "#C2410C", "bg": "#FFF7ED",
            "lines": ["• Honorific Matrix (M3): Tra cứu đại từ sân đình", "• Culture Guide (M10): 20 thẻ phong tục tập quán"],
            "badges": [("Interpreter: Luật xưng hô A6", "#C2410C"), ("Flyweight: Kho thẻ văn hóa", "#9A3412")]
        }
    ]

    for rc in remotes_config:
        add_card(rc["x"], rc["y"], rc["w"], rc["h"], ec=rc["color"], fc=rc["bg"], lw=1.2, r=0.5)
        ax.text(rc["x"] + 1.2, rc["y"] + rc["h"] - 1.2, rc["title"], fontsize=9.5, fontweight='bold', color=rc["color"], va='top')
        for li, line in enumerate(rc["lines"]):
            ax.text(rc["x"] + 1.2, rc["y"] + rc["h"] - 3.8 - li*2.1, line, fontsize=8, color='#374151', va='top')
        
        # Badges inside remote
        rb_x = rc["x"] + 1.2
        for b_name, b_col in rc["badges"]:
            b_w = 13.0
            add_badge(rb_x, rc["y"] + 0.8, b_w, 2.0, b_name, b_col, fs=7.2)
            rb_x += b_w + 1.0

    # ==================== 3. GIAO THỨC TRUYỀN THÔNG (COMMUNICATION) ====================
    ax.annotate("", xy=(30, 43.5), xytext=(30, 46.8),
                arrowprops=dict(arrowstyle="->", lw=2.2, color="#4F46E5"))
    ax.annotate("", xy=(70, 46.8), xytext=(70, 43.5),
                arrowprops=dict(arrowstyle="->", lw=2.2, color="#10B981"))

    add_card(8, 43.0, 84, 3.8, ec="#4F46E5", fc="#EEF2FF", lw=1.5, r=0.5)
    ax.text(50, 45.4, "GIAO THỨC AGENT UI PROTOCOL & LUỒNG SSE (JSON Schema / Zod)", 
            ha='center', va='center', fontsize=9.5, fontweight='bold', color='#312E81')
    ax.text(50, 43.8, "Client gửi: Audio PCM 16kHz WAV / Action Payload  <--->  Gateway trả: SSE Streaming (Transcript, Token, UI Blocks, Chunked Audio)", 
            ha='center', va='center', fontsize=8, color='#4B5563')

    # ==================== 4. TẦNG 2: SAAS GATEWAY (BACKEND) ====================
    # Outer box: y = 14.5 to 42.0 (height 27.5)
    add_card(2, 14.5, 96, 27.5, ec="#059669", fc="#F0FDF4", lw=1.8, r=0.8, ls='--')
    
    # Inner header banner for Tier 2
    add_card(3.5, 38.2, 93, 2.8, ec="none", fc="#D1FAE5", lw=0, r=0.4)
    ax.text(50, 39.6, "TẦNG 2: SAAS GATEWAY BACKEND (Node.js LTS + TypeScript + Fastify Stateless · Zero Client Key)", 
            fontsize=11.5, fontweight='bold', color='#065F46', ha='center', va='center')

    # Pipeline Card
    add_card(3.5, 31.8, 93, 5.5, ec="#10B981", fc="#FFFFFF", lw=1.3, r=0.5)
    ax.text(5.5, 36.0, "REQUEST PIPELINE (Chain of Responsibility & Decorator):", fontsize=9.5, fontweight='bold', color='#065F46', va='top')
    ax.text(5.5, 33.6, "1. Request ID  ->  2. Auth JWT  ->  3. Rate Limit / Quota  ->  4. Validate Zod  ->  5. Service Handler  ->  6. Normalize  ->  7. Audit Log", 
            fontsize=8.3, color='#1F2937', va='top')

    add_badge(68, 34.6, 13.5, 2.0, "Chain of Resp.", "#059669", fs=7.5)
    add_badge(82.5, 34.6, 12.5, 2.0, "Decorator", "#0D9488", fs=7.5)

    # 3 Units in Gateway: Orchestrator, Adapters, Algorithms
    # Col 1: Chat Turn Orchestrator
    add_card(3.5, 15.5, 29.5, 15.0, ec="#047857", fc="#FFFFFF", lw=1.2, r=0.5)
    ax.text(5.0, 29.3, "CHAT ORCHESTRATOR", fontsize=9.5, fontweight='bold', color='#065F46', va='top')
    ax.text(5.0, 26.8, "• Endpoint duy nhất: /v1/chat/turn\n• Điều phối tuần tự STT -> LLM -> TTS\n• Cắt câu sớm để TTS phát stream sớm\n• Thống nhất toàn bộ chu trình thoại", 
            fontsize=7.8, color='#374151', va='top')
    add_badge(5.0, 16.5, 26.5, 2.2, "Facade: Thống nhất chu trình thoại", "#047857", fs=8)

    # Col 2: Provider Adapters
    add_card(35.25, 15.5, 29.5, 15.0, ec="#047857", fc="#FFFFFF", lw=1.2, r=0.5)
    ax.text(36.75, 29.3, "PROVIDER ADAPTERS (Năng Lực)", fontsize=9.5, fontweight='bold', color='#065F46', va='top')
    ax.text(36.75, 26.8, "• SttProvider: Google Cloud STT, Azure\n• TtsProvider: Azure Neural TTS 3 miền\n• LlmProvider: Gemini 1.5, GPT-4o-mini\n• Cơ chế Fallback & Circuit Breaker", 
            fontsize=7.8, color='#374151', va='top')
    add_badge(36.75, 18.8, 26.5, 2.0, "Adapter: Chuẩn hóa API nhà cung cấp", "#2563EB", fs=7.5)
    add_badge(36.75, 16.5, 26.5, 2.0, "Abstract Factory: Họ Adapter theo env", "#7C3AED", fs=7.5)

    # Col 3: 8 Core Custom Algorithms
    add_card(67.0, 15.5, 29.5, 15.0, ec="#047857", fc="#FFFFFF", lw=1.2, r=0.5)
    ax.text(68.5, 29.3, "HẠT NHÂN THUẬT TOÁN (A1 - A8)", fontsize=9.5, fontweight='bold', color='#065F46', va='top')
    ax.text(68.5, 26.8, "• A3: Chấm phát âm NFC tổng hợp\n• A4: Thuật toán lặp ngắt quãng SM-2\n• A5: Xếp lớp thích ứng Elo / Staircase\n• A8: Kiểm tra trật tự câu tre trúc", 
            fontsize=7.8, color='#374151', va='top')
    add_badge(68.5, 18.8, 26.5, 2.0, "Template Method: Quy trình chấm A3", "#D97706", fs=7.5)
    add_badge(68.5, 16.5, 26.5, 2.0, "Chain of Resp.: Kiểm tra cú pháp A8", "#DC2626", fs=7.5)

    # ==================== 5. TẦNG 3: DATA & THIRD PARTY APIS ====================
    ax.annotate("", xy=(30, 12.0), xytext=(30, 14.5),
                arrowprops=dict(arrowstyle="->", lw=2, color="#059669"))
    ax.annotate("", xy=(70, 12.0), xytext=(70, 14.5),
                arrowprops=dict(arrowstyle="->", lw=2, color="#059669"))

    # Outer box: y = 0.8 to 13.5 (height 12.7)
    add_card(2, 0.8, 96, 12.7, ec="#4B5563", fc="#F3F4F6", lw=1.6, r=0.8)
    
    # Inner header banner for Tier 3
    add_card(3.5, 10.2, 93, 2.5, ec="none", fc="#E5E7EB", lw=0, r=0.4)
    ax.text(50, 11.45, "TẦNG 3: DỮ LIỆU & NHÀ CUNG CẤP AI ĐÁM MÂY (Data Tier & Third-Party AI Cloud Providers)", 
            fontsize=11, fontweight='bold', color='#1F2937', ha='center', va='center')

    # Data Sub-box
    add_card(3.5, 1.8, 45.5, 7.8, ec="#6B7280", fc="#FFFFFF", lw=1, r=0.5)
    ax.text(5.0, 8.4, "HỆ THỐNG DỮ LIỆU NỘI BỘ", fontsize=9, fontweight='bold', color='#374151', va='top')
    ax.text(5.0, 6.2, "• PostgreSQL (Drizzle ORM): Users, Sessions, SRS Cards, Attempt logs\n• Redis: Rate limit, Token Quota | S3: TTS Cache (Key Hash), Audio (TTL 30d)", fontsize=7.5, color='#4B5563', va='top')
    add_badge(31, 7.2, 17, 1.8, "Proxy: TTS Cache Proxy", "#0284C7", fs=7)

    # AI Providers Sub-box
    add_card(51.0, 1.8, 45.5, 7.8, ec="#6B7280", fc="#FFFFFF", lw=1, r=0.5)
    ax.text(52.5, 8.4, "DỊCH VỤ TRÍ TUỆ NHÂN TẠO CLOUD (API-First)", fontsize=9, fontweight='bold', color='#374151', va='top')
    ax.text(52.5, 6.2, "• STT Tiếng Việt: Google Cloud STT (vi-VN), Azure Speech, VBEE\n• TTS Tiếng Việt: Azure Neural TTS 3 miền Bắc-Trung-Nam, Google, ElevenLabs\n• LLM Multimodal: Gemini 1.5 Flash / Pro, GPT-4o-mini (Vision dán nhãn đồ vật)", fontsize=7.5, color='#4B5563', va='top')

    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print("NEW_PERFECT_DIAGRAM_SAVED")

if __name__ == '__main__':
    img_path = r"c:\D\Kì cuối\Chuyên đề mobile and pervasive computing - SE405.R11\đồ án mobile\diagram_architecture_gof.png"
    create_clean_architecture_diagram(img_path)
