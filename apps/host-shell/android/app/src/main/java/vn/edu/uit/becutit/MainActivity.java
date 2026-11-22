package vn.edu.uit.becutit;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin nội bộ của app phải đăng ký TRƯỚC super.onCreate
        registerPlugin(SystemBarsPlugin.class);
        registerPlugin(AppSettingsPlugin.class);
        registerPlugin(AudioEnvPlugin.class);
        // Plugin riêng theo flavor (play: không có; apk: cầu nối cài APK) — source set src/<flavor>
        FlavorPlugins.register(this);
        super.onCreate(savedInstanceState);
    }
}
