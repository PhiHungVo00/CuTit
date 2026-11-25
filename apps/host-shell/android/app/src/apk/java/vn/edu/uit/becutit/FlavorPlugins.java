package vn.edu.uit.becutit;

import com.getcapacitor.BridgeActivity;

/**
 * Plugin riêng theo kênh phân phối. Bản `apk` (cài tay) đăng ký cầu nối tự tải và tự cài APK.
 */
final class FlavorPlugins {
    private FlavorPlugins() {}

    static void register(BridgeActivity activity) {
        activity.registerPlugin(ApkUpdaterPlugin.class);
    }
}
