package vn.edu.uit.becutit;

import com.getcapacitor.BridgeActivity;

/**
 * Plugin riêng theo kênh phân phối. Bản `play` (Google Play) KHÔNG có plugin cài APK:
 * chính sách Google Play cấm app tự cập nhật ngoài Play (dự án 8).
 */
final class FlavorPlugins {
    private FlavorPlugins() {}

    static void register(BridgeActivity activity) {
        // cố ý để trống
    }
}
