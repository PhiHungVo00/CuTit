package vn.edu.uit.becutit;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Môi trường âm thanh cho NHẠC NỀN của app:
 * - Máy ở chế độ im lặng/rung (ringer != NORMAL) ⇒ không phát nhạc.
 * - App khác đang phát nhạc (isMusicActive) ⇒ không phát, không giành loa.
 * - Còn lại ⇒ xin AUDIOFOCUS_GAIN (USAGE_GAME / CONTENT_TYPE_MUSIC); mất focus (cuộc gọi, app khác) ⇒ báo
 *   sự kiện "focusLost" để JS dừng nhạc.
 * Mọi lời gọi isSilent() đều đến ngay trước khi nhạc bắt đầu nên việc xin focus gói chung vào đó.
 */
@CapacitorPlugin(name = "AudioEnv")
public class AudioEnvPlugin extends Plugin {

    private AudioFocusRequest focusRequest;
    private boolean hasFocus = false;

    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS
                || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT
                || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) {
            hasFocus = false;
            notifyListeners("focusLost", new JSObject());
        } else if (change == AudioManager.AUDIOFOCUS_GAIN) {
            hasFocus = true;
        }
    };

    private AudioManager audio() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    private boolean requestFocus(AudioManager am) {
        if (hasFocus) return true;
        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();
            focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .setOnAudioFocusChangeListener(focusListener)
                    .build();
            result = am.requestAudioFocus(focusRequest);
        } else {
            result = am.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        hasFocus = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        return hasFocus;
    }

    @PluginMethod
    public void isSilent(PluginCall call) {
        AudioManager am = audio();
        boolean silent = true;
        if (am != null) {
            boolean ringerSilent = am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL;
            // Kiểm tra TRƯỚC khi xin focus: sau khi xin thì chính nhạc của app làm isMusicActive() = true
            boolean otherPlaying = !hasFocus && am.isMusicActive();
            silent = ringerSilent || otherPlaying || !requestFocus(am);
        }
        JSObject ret = new JSObject();
        ret.put("silent", silent);
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        AudioManager am = audio();
        if (am != null && hasFocus) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) am.abandonAudioFocusRequest(focusRequest);
            else am.abandonAudioFocus(focusListener);
        }
        hasFocus = false;
    }
}
