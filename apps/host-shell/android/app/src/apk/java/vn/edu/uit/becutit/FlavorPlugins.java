package vn.edu.uit.becutit;

import com.getcapacitor.BridgeActivity;

/**
 * Plugin riêng theo kênh phân phối. Bản `apk` (cài tay) sẽ đăng ký cầu nối tự tải và tự cài APK.
 */
final class FlavorPlugins {
    private FlavorPlugins() {}

    static void register(BridgeActivity activity) {
        // TODO(dự án 8, Task 6): activity.registerPlugin(ApkUpdaterPlugin.class);
        // Lớp ApkUpdaterPlugin chưa có ở Task 3.
    }
}
