import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches

def create_architecture_diagram(output_path):
    fig, ax = plt.subplots(figsize=(16, 20), dpi=300)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 125)
    ax.axis('off')
    
    # Background color
    fig.patch.set_facecolor('#F8FAFC')
    ax.set_facecolor('#F8FAFC')
    
    # Title Block
    title_box = patches.FancyBboxPatch((5, 114), 90, 8, boxstyle="round,pad=1", ec="#4338CA", fc="#4F46E5", lw=2)
    ax.add_patch(title_box)
    ax.text(50, 119, "SƠ ĐỒ KIẾN TRÚC TỔNG THỂ & 23 MẪU THIẾT KẾ GoF", 
            ha='center', va='center', fontsize=18, fontweight='bold', color='white', fontfamily='sans-serif')
    ax.text(50, 116, "Ứng Dụng Học Tiếng Việt Cho Người Nước Ngoài (Agentic Vietnamese Learning - Mascot Cu Tít)", 
            ha='center', va='center', fontsize=12, color='#E0E7FF', fontfamily='sans-serif')

    # ==================== TẦNG 1: CLIENT TIER (MICRO FRONTEND) ====================
    client_box = patches.FancyBboxPatch((5, 72), 90, 39, boxstyle="round,pad=1", ec="#3B82F6", fc="#EFF6FF", lw=2, linestyle='--')
    ax.add_patch(client_box)
    ax.text(8, 108, "TẦNG CLIENT: Web Responsive + PWA / Capacitor (React + Vite + Module Federation)", 
            fontsize=13, fontweight='bold', color='#1E40AF', fontfamily='sans-serif')
    
    # Host Shell
    host_box = patches.FancyBboxPatch((8, 93), 84, 13, boxstyle="round,pad=0.8", ec="#2563EB", fc="#DBEAFE", lw=1.5)
    ax.add_patch(host_box)
    ax.text(10, 103, "HOST SHELL (apps/host-shell) - Điều phối trung tâm & Nền tảng chia sẻ", 
            fontsize=11, fontweight='bold', color='#1E3A8A', fontfamily='sans-serif')
    ax.text(10, 99.5, "• Core Engine: Routing, Auth Session, Theme, i18n, Error Boundary, useRecorder, AudioWorklet", 
            fontsize=9.5, color='#1F2937', fontfamily='sans-serif')
    ax.text(10, 96.5, "• Agent UI Registry: Dynamic Block Resolver | Typed Event Bus: session, attempt, action, prefs", 
            fontsize=9.5, color='#1F2937', fontfamily='sans-serif')
    
    # Badges for Host Shell Patterns
    patterns_host = [
        ("Singleton: EventBus & AudioContext", "#10B981"),
        ("Mediator: Host điều phối Remotes", "#8B5CF6"),
        ("Composite: Agent UI Block Tree", "#F59E0B"),
        ("Visitor: Block Sanitizer & Analytics", "#EC4899"),
        ("Command: User UI Block Actions", "#06B6D4")
    ]
    x_badge = 10
    for p_name, p_col in patterns_host:
        p_patch = patches.FancyBboxPatch((x_badge, 93.8), len(p_name)*0.85 + 2, 2.2, boxstyle="round,pad=0.3", ec="none", fc=p_col)
        ax.add_patch(p_patch)
        ax.text(x_badge + (len(p_name)*0.85 + 2)/2, 94.9, p_name, ha='center', va='center', fontsize=7.5, fontweight='bold', color='white')
        x_badge += len(p_name)*0.85 + 3.2

    # 6 Remote MFEs Grid
    remotes = [
        {
            "name": "1. mfe-conversation",
            "desc": "Chat Canvas (M1)\nRoleplay Simulator (M7)\nMulti-turn streaming UI",
            "patterns": ["State: Chu trình lượt hội thoại", "Prototype: Kịch bản nhập vai"],
            "col": "#FDF2F8", "ec": "#DB2777", "tx": "#831843"
        },
        {
            "name": "2. mfe-practice",
            "desc": "Adaptive Drill Cards (M5)\nSentence Builder (M8)\nKéo-thả token tre trúc",
            "patterns": ["Factory Method: Thẻ bài tập", "Memento: Undo/Redo ghép câu"],
            "col": "#F0FDF4", "ec": "#16A34A", "tx": "#14532D"
        },
        {
            "name": "3. mfe-learner",
            "desc": "Adaptive Onboarding (M11)\nAnalytics & SRS (M9)\nAI Preferences (M12)",
            "patterns": ["Iterator: Duyệt thẻ SRS", "Strategy: Thuật toán thích ứng A5"],
            "col": "#FEFCE8", "ec": "#CA8A04", "tx": "#713F12"
        },
        {
            "name": "4. mfe-speech-lab",
            "desc": "Pitch Visualizer (M2 - F0)\nDialect Switcher (M6)\nSo sánh thanh Bắc/Trung/Nam",
            "patterns": ["Strategy: Thuật toán YIN/McLeod A1", "Flyweight: Mẫu contour tham chiếu"],
            "col": "#EFF6FF", "ec": "#2563EB", "tx": "#1E3A8A"
        },
        {
            "name": "5. mfe-vision",
            "desc": "AR Camera Surface (M4)\nQuán nước gốc đa AR\nNhận diện đồ vật đời thực",
            "patterns": ["Bridge: Nền tảng Camera Web/Native", "Observer: Lắng nghe khung hình"],
            "col": "#FAF5FF", "ec": "#9333EA", "tx": "#581C87"
        },
        {
            "name": "6. mfe-knowledge",
            "desc": "Honorific Matrix (M3)\nCulture Guide (M10)\nTra cứu xưng hô sân đình",
            "patterns": ["Interpreter: Bộ luật xưng hô A6", "Flyweight: Kho thẻ văn hóa tĩnh"],
            "col": "#FFF7ED", "ec": "#EA580C", "tx": "#7C2D12"
        },
    ]

    mfe_coords = [
        (8, 74), (22.5, 74), (37, 74), (51.5, 74), (66, 74), (80.5, 74)
    ]
    
    for i, (rm, (rx, ry)) in enumerate(zip(remotes, mfe_coords)):
        rm_box = patches.FancyBboxPatch((rx, ry), 12.5, 17, boxstyle="round,pad=0.5", ec=rm["ec"], fc=rm["col"], lw=1.2)
        ax.add_patch(rm_box)
        ax.text(rx + 6.25, ry + 15.5, rm["name"], ha='center', va='center', fontsize=8.5, fontweight='bold', color=rm["tx"])
        ax.text(rx + 0.8, ry + 11.5, rm["desc"], fontsize=7.2, color='#374151', va='center')
        
        # Pattern pills in MFE
        for pi, pat in enumerate(rm["patterns"]):
            p_patch = patches.FancyBboxPatch((rx + 0.5, ry + 4.5 - pi*3.2), 11.5, 2.5, boxstyle="round,pad=0.2", ec="none", fc=rm["ec"])
            ax.add_patch(p_patch)
            ax.text(rx + 6.25, ry + 5.75 - pi*3.2, pat, ha='center', va='center', fontsize=6.2, fontweight='bold', color='white')

    # ==================== GIAO THỨC TRUYỀN THÔNG Ở GIỮA ====================
    # Connecting Arrows
    ax.annotate("", xy=(30, 63), xytext=(30, 72),
                arrowprops=dict(arrowstyle="->", lw=2, color="#4F46E5", connectionstyle="arc3,rad=-0.1"))
    ax.annotate("", xy=(70, 72), xytext=(70, 63),
                arrowprops=dict(arrowstyle="->", lw=2, color="#10B981", connectionstyle="arc3,rad=-0.1"))
    
    comm_box = patches.FancyBboxPatch((15, 63.5), 70, 6.5, boxstyle="round,pad=0.5", ec="#6366F1", fc="#EEF2FF", lw=1.5)
    ax.add_patch(comm_box)
    ax.text(50, 68, "GIAO THỨC TRUYỀN THÔNG & AGENT UI PROTOCOL (JSON Schema / Zod)", 
            ha='center', va='center', fontsize=10.5, fontweight='bold', color='#3730A3')
    ax.text(50, 65, "Client gửi: Audio PCM 16kHz WAV / Action Payload | Gateway trả về: SSE Stream (Transcript, Tokens, UI Blocks, Audio Chunk)", 
            ha='center', va='center', fontsize=8.5, color='#4B5563')

    # ==================== TẦNG 2: SAAS GATEWAY (BACKEND TIER) ====================
    gw_box = patches.FancyBboxPatch((5, 24), 90, 36.5, boxstyle="round,pad=1", ec="#059669", fc="#F0FDF4", lw=2, linestyle='--')
    ax.add_patch(gw_box)
    ax.text(8, 58, "TẦNG BACKEND: SaaS Gateway Stateless (Node.js LTS + TypeScript + Fastify)", 
            fontsize=13, fontweight='bold', color='#065F46', fontfamily='sans-serif')

    # Pipeline Box
    pipe_box = patches.FancyBboxPatch((8, 48), 84, 8, boxstyle="round,pad=0.6", ec="#10B981", fc="#D1FAE5", lw=1.2)
    ax.add_patch(pipe_box)
    ax.text(10, 54, "REQUEST PIPELINE (Xử lý tuần tự & Kiểm soát an toàn)", fontsize=10.5, fontweight='bold', color='#047857')
    ax.text(10, 50.5, "1. Request ID ➔ 2. Auth JWT ➔ 3. Rate Limit / Quota ➔ 4. Validate Zod ➔ 5. Service Handler ➔ 6. Normalize ➔ 7. Audit Log", 
            fontsize=9, color='#1F2937')
    
    pipe_patterns = [
        ("Chain of Responsibility: Pipeline tuần tự", "#059669"),
        ("Decorator: Bọc Quota/Logging/Auth", "#0D9488"),
        ("Proxy: Caching Proxy Audio & Drill", "#0284C7")
    ]
    px = 42
    for p_name, p_col in pipe_patterns:
        p_patch = patches.FancyBboxPatch((px, 52.8), len(p_name)*0.85 + 2, 2.2, boxstyle="round,pad=0.2", ec="none", fc=p_col)
        ax.add_patch(p_patch)
        ax.text(px + (len(p_name)*0.85 + 2)/2, 53.9, p_name, ha='center', va='center', fontsize=7.2, fontweight='bold', color='white')
        px += len(p_name)*0.85 + 3.2

    # Internal Engines Box
    # Col 1: Facade & Orchestrator
    sub1 = patches.FancyBboxPatch((8, 26), 26, 20, boxstyle="round,pad=0.5", ec="#047857", fc="#FFFFFF", lw=1)
    ax.add_patch(sub1)
    ax.text(21, 44, "CHAT TURN ORCHESTRATOR", ha='center', fontsize=9.5, fontweight='bold', color='#065F46')
    ax.text(10, 39, "• Endpoint /v1/chat/turn\n• Điều phối STT ➔ LLM ➔ TTS\n• Cắt câu sớm để TTS phát stream\n• Gom toàn bộ tác vụ thành 1 API duy nhất", fontsize=8, color='#374151')
    
    p_facade = patches.FancyBboxPatch((9.5, 27.5), 23, 3, boxstyle="round,pad=0.2", ec="none", fc="#059669")
    ax.add_patch(p_facade)
    ax.text(21, 29, "Facade: Thống nhất chu trình hội thoại", ha='center', va='center', fontsize=7.5, fontweight='bold', color='white')

    # Col 2: Provider Adapters
    sub2 = patches.FancyBboxPatch((36.5, 26), 27, 20, boxstyle="round,pad=0.5", ec="#047857", fc="#FFFFFF", lw=1)
    ax.add_patch(sub2)
    ax.text(50, 44, "PROVIDER ADAPTERS (Theo Năng Lực)", ha='center', fontsize=9.5, fontweight='bold', color='#065F46')
    ax.text(38, 38.5, "• SttProvider: transcribe(audio)\n• TtsProvider: synthesize(text, voice)\n• LlmProvider: json<T>(), stream()\n• Cơ chế Fallback & Circuit Breaker", fontsize=8, color='#374151')

    p_adap1 = patches.FancyBboxPatch((38, 30), 24, 2.6, boxstyle="round,pad=0.2", ec="none", fc="#2563EB")
    ax.add_patch(p_adap1)
    ax.text(50, 31.3, "Adapter: Chuẩn hóa API nhà cung cấp", ha='center', va='center', fontsize=7.2, fontweight='bold', color='white')

    p_adap2 = patches.FancyBboxPatch((38, 27), 24, 2.6, boxstyle="round,pad=0.2", ec="none", fc="#7C3AED")
    ax.add_patch(p_adap2)
    ax.text(50, 28.3, "Abstract Factory: Họ adapter theo config", ha='center', va='center', fontsize=7.2, fontweight='bold', color='white')

    # Col 3: 8 Core Custom Algorithms
    sub3 = patches.FancyBboxPatch((66, 26), 26, 20, boxstyle="round,pad=0.5", ec="#047857", fc="#FFFFFF", lw=1)
    ax.add_patch(sub3)
    ax.text(79, 44, "THUẬT TOÁN TỰ VIẾT (A1 - A8)", ha='center', fontsize=9.5, fontweight='bold', color='#065F46')
    ax.text(67.5, 36.5, "• A3: Chấm phát âm tổng hợp\n• A4: Thuật toán lặp lại ngắt quãng SM-2\n• A5: Đánh giá thích ứng Staircase/Elo\n• A6: Ma trận luật xưng hô tiếng Việt\n• A7: Ánh xạ từ vựng phương ngữ\n• A8: Kiểm tra trật tự câu tiếng Việt", fontsize=7.5, color='#374151')

    p_alg1 = patches.FancyBboxPatch((67.5, 30), 23, 2.6, boxstyle="round,pad=0.2", ec="none", fc="#D97706")
    ax.add_patch(p_alg1)
    ax.text(79, 31.3, "Template Method: Quy trình chấm A3", ha='center', va='center', fontsize=7.2, fontweight='bold', color='white')

    p_alg2 = patches.FancyBboxPatch((67.5, 27), 23, 2.6, boxstyle="round,pad=0.2", ec="none", fc="#DC2626")
    ax.add_patch(p_alg2)
    ax.text(79, 28.3, "Chain of Resp.: Kiểm tra trật tự câu A8", ha='center', va='center', fontsize=7.2, fontweight='bold', color='white')

    # ==================== TẦNG 3: DATA & THIRD PARTY APIS ====================
    # Connecting Arrows
    ax.annotate("", xy=(30, 18), xytext=(30, 24),
                arrowprops=dict(arrowstyle="->", lw=2, color="#059669"))
    ax.annotate("", xy=(70, 18), xytext=(70, 24),
                arrowprops=dict(arrowstyle="->", lw=2, color="#059669"))

    infra_box = patches.FancyBboxPatch((5, 2), 90, 16, boxstyle="round,pad=1", ec="#4B5563", fc="#F3F4F6", lw=1.8)
    ax.add_patch(infra_box)
    ax.text(8, 15.5, "TẦNG DỮ LIỆU & NHÀ CUNG CẤP NGOÀI (Data Tier & External AI Cloud Providers)", 
            fontsize=12, fontweight='bold', color='#1F2937', fontfamily='sans-serif')

    # Data block
    d_box = patches.FancyBboxPatch((8, 4), 40, 9.5, boxstyle="round,pad=0.5", ec="#6B7280", fc="#FFFFFF", lw=1)
    ax.add_patch(d_box)
    ax.text(28, 11.5, "HỆ THỐNG DỮ LIỆU NỘI BỘ", ha='center', fontsize=9, fontweight='bold', color='#374151')
    ax.text(10, 7.5, "• PostgreSQL (Drizzle ORM): Users, Sessions, SRS Cards, Logs\n• Redis: Rate Limit, Cache Token, Quota Counter\n• S3-Compatible Storage: TTS Cache (Key Hash), Audio học viên (TTL 30d)", fontsize=7.5, color='#4B5563')

    # Providers block
    p_box = patches.FancyBboxPatch((52, 4), 40, 9.5, boxstyle="round,pad=0.5", ec="#6B7280", fc="#FFFFFF", lw=1)
    ax.add_patch(p_box)
    ax.text(72, 11.5, "DỊCH VỤ TRÍ TUỆ NHÂN TẠO CLOUD (API-First)", ha='center', fontsize=9, fontweight='bold', color='#374151')
    ax.text(54, 7.5, "• STT: Google Cloud STT (vi-VN), Azure Speech, VBEE\n• TTS: Azure Neural TTS (Giọng Bắc/Trung/Nam), Google TTS, ElevenLabs\n• LLM: Gemini 1.5 Flash / Pro, GPT-4o-mini (Multimodal Vision, JSON Schema)", fontsize=7.5, color='#4B5563')

    # Save
    plt.tight_layout()
    plt.savefig(output_path, dpi=300, bbox_inches='tight')
    plt.close()
    print(f"Diagram saved to {output_path}")

if __name__ == '__main__':
    img_path = r"c:\D\Kì cuối\Chuyên đề mobile and pervasive computing - SE405.R11\đồ án mobile\diagram_architecture_gof.png"
    create_architecture_diagram(img_path)
