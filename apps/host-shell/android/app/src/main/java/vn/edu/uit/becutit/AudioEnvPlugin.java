package vn.edu.uit.becutit;

import android.content.Context;
import android.media.AudioManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Môi trường âm thanh cho NHẠC NỀN của app:
 * - Máy ở chế độ im lặng/rung (ringer != NORMAL) ⇒ không phát nhạc.
 * - App khác đang phát nhạc (isMusicActive) ⇒ không phát, không giành loa.
 *
 * KHÔNG tự xin AudioFocus ở đây: WebView (Chromium) tự xin focus mỗi khi một phần tử audio phát, nên một yêu cầu
 * focus riêng của plugin bị chính Chromium giành lại ngay (đã thử trên AVD: nhạc vừa phát đã bị báo "mất focus"
 * và tự dừng). Khi app khác giành loa, Chromium nhận AUDIOFOCUS_LOSS và tự tạm dừng phần tử audio.
 */
@CapacitorPlugin(name = "AudioEnv")
public class AudioEnvPlugin extends Plugin {

    @PluginMethod
    public void isSilent(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        boolean silent = false;
        if (am != null) {
            silent = am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL || am.isMusicActive();
        }
        JSObject ret = new JSObject();
        ret.put("silent", silent);
        call.resolve(ret);
    }
}
