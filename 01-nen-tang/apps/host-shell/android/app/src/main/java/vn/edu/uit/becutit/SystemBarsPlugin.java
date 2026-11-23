package vn.edu.uit.becutit;

import android.graphics.Color;
import android.view.Window;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Đổi màu dải status bar / navigation bar theo giao diện sáng/tối của app.
 *
 * Android 15 (targetSdk 35) bắt buộc vẽ tràn viền: vùng sau hai dải hệ thống là nền cửa sổ
 * (window background), không phải WebView, nên JavaScript không đổi được. Plugin này đổi nền
 * cửa sổ và màu biểu tượng hệ thống (chữ giờ, pin...) cho tương phản đúng.
 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    @PluginMethod
    public void setTheme(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", true));
        String colorHex = call.getString("color", dark ? "#1F1710" : "#FBF3E4");
        final int color;
        try {
            color = Color.parseColor(colorHex);
        } catch (IllegalArgumentException e) {
            call.reject("Màu không hợp lệ: " + colorHex);
            return;
        }

        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            window.getDecorView().setBackgroundColor(color);
            // Android < 15 vẫn dùng hai API này; Android 15 bỏ qua (đã có nền cửa sổ ở trên)
            window.setStatusBarColor(color);
            window.setNavigationBarColor(color);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            // Nền sáng => biểu tượng tối, và ngược lại
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
            call.resolve();
        });
    }
}
