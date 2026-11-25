package vn.edu.uit.becutit;

import android.app.DownloadManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.StatFs;
import android.provider.Settings;

import androidx.core.content.ContextCompat;
import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Tự tải và tự cài APK (dự án 8, Task 6) — CHỈ có ở flavor `apk` (cài tay); bản `play` không biên dịch lớp này.
 *
 * Luồng: download() ⇒ DownloadManager tải vào thư mục riêng của app (getExternalFilesDir("updates"), tên theo build) ⇒
 * kiểm SHA-256 + kích thước ⇒ install() sao chép sang bộ nhớ trong của app trong lúc tính lại SHA-256 (chống bị thay tệp
 * giữa lúc kiểm và lúc cài), kiểm tên gói + versionCode, rồi cài bằng PackageInstaller session.
 * Không dùng FileProvider: tệp không bao giờ chia sẻ cho app khác (PackageInstaller nhận byte trực tiếp).
 *
 * Danh sách host cho phép: `plugins.ApkUpdater.allowedHosts` trong capacitor.config (bản release bắt buộc có, rỗng ⇒
 * từ chối hết); bản debug rỗng ⇒ không giới hạn host (để thử với máy chủ 10.0.2.2).
 *
 * Mẫu tham khảo (đọc để hiểu, viết lại theo kiến trúc dự án): tài liệu Android về DownloadManager và PackageInstaller.
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {
    private static final String PREFS = "apk_updater";
    private static final String ACTION_INSTALL_STATUS_SUFFIX = ".APK_INSTALL_STATUS";
    private static final long SPACE_MARGIN = 20L * 1024 * 1024;

    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor();
    private ScheduledFuture<?> pollTask;
    private BroadcastReceiver installReceiver;
    private int lastPercent = -1;
    private int pollTicks = 0;
    private int currentSessionId = -1;

    @Override
    public void load() {
        Context ctx = getContext();
        installReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                onInstallResult(intent);
            }
        };
        ContextCompat.registerReceiver(
                ctx,
                installReceiver,
                new IntentFilter(ctx.getPackageName() + ACTION_INSTALL_STATUS_SUFFIX),
                ContextCompat.RECEIVER_NOT_EXPORTED);
    }

    @Override
    protected void handleOnDestroy() {
        try {
            getContext().unregisterReceiver(installReceiver);
        } catch (Exception ignored) {
        }
        stopPolling();
        poller.shutdownNow();
        io.shutdownNow();
    }

    // ---------------------------------------------------------------- tiện ích

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private boolean isDebug() {
        return (getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private List<String> allowedHosts() {
        List<String> out = new ArrayList<>();
        try {
            String[] arr = getConfig().getArray("allowedHosts", new String[0]);
            if (arr != null) for (String s : arr) if (s != null && !s.trim().isEmpty()) out.add(s.trim());
        } catch (Exception ignored) {
        }
        return out;
    }

    private File updatesDir() {
        File base = getContext().getExternalFilesDir("updates");
        if (base == null) base = new File(getContext().getFilesDir(), "updates");
        //noinspection ResultOfMethodCallIgnored
        base.mkdirs();
        return base;
    }

    /** Bản sao đã kiểm, nằm trong bộ nhớ trong (chỉ app này đọc được). */
    private File verifiedDir() {
        File d = new File(getContext().getFilesDir(), "apk-verified");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    private long runningBuild() {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return PackageInfoCompat.getLongVersionCode(pi);
        } catch (Exception e) {
            return Long.MAX_VALUE; // không đọc được ⇒ coi như mới nhất ⇒ không cài gì
        }
    }

    private DownloadManager dm() {
        return (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
    }

    private static void deleteQuietly(File f) {
        if (f != null && f.exists() && !f.delete()) f.deleteOnExit();
    }

    private void emit(String event, JSObject data) {
        notifyListeners(event, data);
    }

    private void emitDownloadState(String state, String code) {
        JSObject o = new JSObject();
        o.put("state", state);
        if (code != null) o.put("code", code);
        emit("downloadState", o);
    }

    private void emitInstallStatus(String status, String message) {
        JSObject o = new JSObject();
        o.put("status", status);
        if (message != null) o.put("message", message);
        emit("installStatus", o);
    }

    private static long freeBytes(File dir) {
        try {
            return new StatFs(dir.getPath()).getAvailableBytes();
        } catch (Exception e) {
            return Long.MAX_VALUE;
        }
    }

    /** SHA-256 + kích thước của tệp; null nếu không đọc được. */
    private static Object[] hashFile(File f) {
        try (InputStream in = new FileInputStream(f)) {
            long[] n = new long[1];
            String h = ApkUpdateRules.copyAndHash(in, null, n);
            return new Object[] {h, n[0]};
        } catch (Exception e) {
            return null;
        }
    }

    private boolean fileMatches(File f, String sha, long size) {
        if (!f.isFile() || f.length() != size) return false;
        Object[] r = hashFile(f);
        return r != null && ApkUpdateRules.matches((String) r[0], (Long) r[1], sha, size);
    }

    /** Đọc số nguyên từ JS (JSON có thể là Integer/Long/Double); không phải số ⇒ null. */
    private static Long readLong(PluginCall call, String key) {
        Object v = call.getData().opt(key);
        if (v instanceof Number) {
            double d = ((Number) v).doubleValue();
            if (d == Math.rint(d) && Math.abs(d) < 9e15) return ((Number) v).longValue();
        }
        return null;
    }

    // ---------------------------------------------------------------- tải

    @PluginMethod
    public void download(final PluginCall call) {
        final String url = call.getString("url");
        final String sha = call.getString("sha256");
        final Long sizeObj = readLong(call, "sizeBytes");
        final Long buildObj = readLong(call, "build");
        final boolean allowMetered = Boolean.TRUE.equals(call.getBoolean("allowMetered", false));

        if (sizeObj == null || buildObj == null || !ApkUpdateRules.isValidSha256(sha)
                || !ApkUpdateRules.isValidSize(sizeObj) || !ApkUpdateRules.isValidBuild(buildObj)) {
            call.reject("Tham số tải không hợp lệ", "invalid_args");
            return;
        }
        final long size = sizeObj;
        final long build = buildObj;
        String urlError = ApkUpdateRules.checkUrl(url, isDebug(), allowedHosts());
        if (urlError != null) {
            call.reject("URL tải không được phép", urlError);
            return;
        }
        if (build <= runningBuild()) {
            call.reject("Bản này không mới hơn bản đang chạy", "invalid_args");
            return;
        }

        io.execute(() -> {
            try {
                File target = ApkUpdateRules.fileFor(updatesDir(), build);
                SharedPreferences p = prefs();
                // Lưu giá trị kỳ vọng theo build để install() kiểm lại sau này.
                p.edit().putString("sha_" + build, sha.toLowerCase()).putLong("size_" + build, size).apply();

                // 1. Tệp đã tải đúng sẵn ⇒ xong ngay.
                if (fileMatches(target, sha, size)) {
                    call.resolve(new JSObject().put("state", "done"));
                    emitDownloadState("done", null);
                    return;
                }

                // 2. Đang có lượt tải cho đúng build này ⇒ nối lại, không tải lại.
                long oldId = p.getLong("dl_id", -1);
                long oldBuild = p.getLong("dl_build", -1);
                if (oldId >= 0) {
                    int st = queryStatus(oldId);
                    boolean alive = st == DownloadManager.STATUS_RUNNING || st == DownloadManager.STATUS_PENDING
                            || st == DownloadManager.STATUS_PAUSED;
                    // Đang chờ Wi-Fi (allowMetered=false) mà người dùng đồng ý dùng dữ liệu di động ⇒ phải xếp lại với allowMetered=true.
                    boolean oldMetered = p.getBoolean("dl_metered", false);
                    if (alive && oldBuild == build && (oldMetered || !allowMetered)) {
                        startPolling(oldId, build, sha, size);
                        call.resolve(new JSObject().put("state", "queued"));
                        return;
                    }
                    // lượt cũ (build khác hoặc đã hỏng) ⇒ hủy và dọn
                    try { dm().remove(oldId); } catch (Exception ignored) { }
                    p.edit().remove("dl_id").remove("dl_build").remove("dl_metered").apply();
                }

                // 3. Đủ dung lượng? (ước lượng: kích thước tệp + lề)
                if (freeBytes(updatesDir()) < size + SPACE_MARGIN) {
                    call.reject("Không đủ dung lượng để tải bản cập nhật", "storage");
                    return;
                }

                // 4. Xếp hàng DownloadManager (xóa tệp cũ cùng tên để DM không đổi tên thành -1.apk).
                deleteQuietly(target);
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setTitle("Bé Cu Tít");
                req.setDestinationInExternalFilesDir(getContext(), "updates", ApkUpdateRules.fileName(build));
                req.setAllowedOverMetered(allowMetered);
                req.setAllowedOverRoaming(allowMetered);
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_HIDDEN);
                long id = dm().enqueue(req);
                p.edit().putLong("dl_id", id).putLong("dl_build", build).putBoolean("dl_metered", allowMetered).apply();
                lastPercent = -1;
                startPolling(id, build, sha, size);
                call.resolve(new JSObject().put("state", "queued"));
            } catch (SecurityException e) {
                call.reject("Thiếu quyền tải", "failed", e);
            } catch (Exception e) {
                call.reject("Không bắt đầu được lượt tải", "network", e);
            }
        });
    }

    private int queryStatus(long id) {
        try (Cursor c = dm().query(new DownloadManager.Query().setFilterById(id))) {
            if (c != null && c.moveToFirst()) return c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
        } catch (Exception ignored) {
        }
        return -1;
    }

    /** Theo dõi tiến độ mỗi 0,5 s; DownloadManager tự tiếp tục khi có lại mạng (trạng thái PAUSED). */
    private synchronized void startPolling(final long id, final long build, final String sha, final long size) {
        stopPolling();
        pollTask = poller.scheduleWithFixedDelay(() -> {
            try (Cursor c = dm().query(new DownloadManager.Query().setFilterById(id))) {
                if (c == null || !c.moveToFirst()) {
                    // Bản ghi biến mất (người dùng hủy từ hệ thống) ⇒ báo lỗi mạng để JS cho thử lại.
                    finishDownload(false, "network", build, sha, size);
                    return;
                }
                int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                if (++pollTicks % 10 == 1) {
                    android.util.Log.d("ApkUpdater", "download " + id + " status=" + status + " reason=" + c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)));
                }
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    finishDownload(true, null, build, sha, size);
                } else if (status == DownloadManager.STATUS_FAILED) {
                    int reason = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                    boolean storage = reason == DownloadManager.ERROR_INSUFFICIENT_SPACE
                            || reason == DownloadManager.ERROR_DEVICE_NOT_FOUND;
                    finishDownload(false, storage ? "storage" : "network", build, sha, size);
                } else {
                    long soFar = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    int pct = (int) Math.max(0, Math.min(100, soFar * 100 / size));
                    if (pct != lastPercent) {
                        lastPercent = pct;
                        emit("downloadProgress", new JSObject().put("percent", pct));
                    }
                }
            } catch (Exception e) {
                // lỗi thoáng qua khi truy vấn: thử lại ở nhịp sau
            }
        }, 0, 500, TimeUnit.MILLISECONDS);
    }

    private synchronized void stopPolling() {
        if (pollTask != null) {
            pollTask.cancel(false);
            pollTask = null;
        }
    }

    private void finishDownload(boolean ok, String code, long build, String sha, long size) {
        stopPolling();
        SharedPreferences p = prefs();
        p.edit().remove("dl_id").remove("dl_build").apply();
        File f = ApkUpdateRules.fileFor(updatesDir(), build);
        if (!ok) {
            deleteQuietly(f);
            emitDownloadState("failed", code);
            return;
        }
        if (!fileMatches(f, sha, size)) {
            deleteQuietly(f); // sai SHA/kích thước ⇒ xóa, không giữ
            emitDownloadState("failed", "verify_failed");
            return;
        }
        emit("downloadProgress", new JSObject().put("percent", 100));
        emitDownloadState("done", null);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        io.execute(() -> {
            stopPolling();
            SharedPreferences p = prefs();
            long id = p.getLong("dl_id", -1);
            long build = p.getLong("dl_build", -1);
            if (id >= 0) {
                try { dm().remove(id); } catch (Exception ignored) { }
            }
            if (build > 0) deleteQuietly(ApkUpdateRules.fileFor(updatesDir(), build));
            p.edit().remove("dl_id").remove("dl_build").apply();
            call.resolve();
        });
    }

    // ---------------------------------------------------------------- quyền cài

    private boolean canInstallNow() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        call.resolve(new JSObject().put("allowed", canInstallNow()));
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
            } else {
                intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Không mở được Cài đặt", "failed", e);
        }
    }

    // ---------------------------------------------------------------- cài

    @PluginMethod
    public void install(final PluginCall call) {
        final Long buildObj = readLong(call, "build");
        if (buildObj == null || !ApkUpdateRules.isValidBuild(buildObj)) {
            call.reject("Tham số cài không hợp lệ", "invalid_args");
            return;
        }
        final long build = buildObj;
        if (!canInstallNow()) {
            call.reject("Chưa bật \"Cho phép cài ứng dụng từ nguồn này\"", "install_not_allowed");
            return;
        }
        io.execute(() -> {
            File verified = ApkUpdateRules.fileFor(verifiedDir(), build);
            try {
                SharedPreferences p = prefs();
                String sha = p.getString("sha_" + build, null);
                long size = p.getLong("size_" + build, -1);
                File src = ApkUpdateRules.fileFor(updatesDir(), build);
                if (sha == null || size <= 0 || !src.isFile()) {
                    call.reject("Chưa tải bản này", "not_downloaded");
                    return;
                }
                if (freeBytes(verifiedDir()) < size + SPACE_MARGIN) {
                    call.reject("Không đủ dung lượng để cài", "storage");
                    return;
                }

                // Lần kiểm thứ hai, trên bản sao riêng của app (chống thay tệp giữa lúc kiểm và lúc cài).
                String actual;
                long[] n = new long[1];
                try (InputStream in = new FileInputStream(src); OutputStream out = new FileOutputStream(verified)) {
                    actual = ApkUpdateRules.copyAndHash(in, out, n);
                }
                if (!ApkUpdateRules.matches(actual, n[0], sha, size)) {
                    deleteQuietly(src);
                    deleteQuietly(verified);
                    call.reject("Tệp cập nhật không khớp SHA-256/kích thước", "verify_failed");
                    return;
                }
                String bad = checkPackage(verified, build);
                if (bad != null) {
                    deleteQuietly(src);
                    deleteQuietly(verified);
                    call.reject(bad, "verify_failed");
                    return;
                }

                commitSession(verified, size);
                call.resolve();
            } catch (java.io.IOException e) {
                deleteQuietly(verified);
                boolean noSpace = e.getMessage() != null && e.getMessage().toLowerCase().contains("space");
                call.reject("Không ghi được tệp cài", noSpace ? "storage" : "failed", e);
            } catch (Exception e) {
                deleteQuietly(verified);
                call.reject("Không cài được: " + e.getClass().getSimpleName(), "failed", e);
            }
        });
    }

    /** Trả null nếu đúng tên gói và versionCode (== build và > bản đang chạy), ngược lại trả lý do. */
    private String checkPackage(File apk, long build) {
        PackageInfo info = getContext().getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (info == null) return "Tệp không phải APK hợp lệ";
        if (!getContext().getPackageName().equals(info.packageName)) return "APK có tên gói khác";
        long code = PackageInfoCompat.getLongVersionCode(info);
        if (code != build) return "versionCode của APK không khớp bản công bố";
        if (code <= runningBuild()) return "APK không mới hơn bản đang chạy";
        return null;
    }

    private void commitSession(File apk, long size) throws java.io.IOException {
        PackageInstaller installer = getContext().getPackageManager().getPackageInstaller();
        if (currentSessionId >= 0) {
            try { installer.abandonSession(currentSessionId); } catch (Exception ignored) { }
            currentSessionId = -1;
        }
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(getContext().getPackageName());
        params.setSize(size);
        int sessionId = installer.createSession(params);
        currentSessionId = sessionId;
        try (PackageInstaller.Session session = installer.openSession(sessionId)) {
            try (InputStream in = new FileInputStream(apk); OutputStream out = session.openWrite("base.apk", 0, size)) {
                byte[] buf = new byte[64 * 1024];
                int r;
                while ((r = in.read(buf)) > 0) out.write(buf, 0, r);
                session.fsync(out);
            }
            // Intent tường minh tới chính app. PackageInstaller phải điền thêm extras nên cần FLAG_MUTABLE (Android 12+);
            // an toàn vì receiver không xuất ra ngoài (RECEIVER_NOT_EXPORTED) và intent chỉ gửi tới gói của mình.
            Intent cb = new Intent(getContext().getPackageName() + ACTION_INSTALL_STATUS_SUFFIX).setPackage(getContext().getPackageName());
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent pi = PendingIntent.getBroadcast(getContext(), sessionId, cb, flags);
            session.commit(pi.getIntentSender());
        } catch (java.io.IOException | RuntimeException e) {
            try { installer.abandonSession(sessionId); } catch (Exception ignored) { }
            currentSessionId = -1;
            throw e;
        }
    }

    private void onInstallResult(Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        String msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        switch (status) {
            case PackageInstaller.STATUS_PENDING_USER_ACTION: {
                Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
                if (confirm == null) {
                    emitInstallStatus("failed", "Không có hộp xác nhận");
                    return;
                }
                try {
                    confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(confirm);
                    emitInstallStatus("pending_user", null);
                } catch (Exception e) {
                    emitInstallStatus("failed", "Không mở được hộp xác nhận");
                }
                return;
            }
            case PackageInstaller.STATUS_SUCCESS:
                currentSessionId = -1;
                emitInstallStatus("success", null);
                return;
            case PackageInstaller.STATUS_FAILURE_ABORTED: // người dùng bấm Hủy
                currentSessionId = -1;
                deleteVerified();
                emitInstallStatus("cancelled", null);
                return;
            default:
                currentSessionId = -1;
                deleteVerified();
                emitInstallStatus("failed", msg);
        }
    }

    private void deleteVerified() {
        File[] fs = verifiedDir().listFiles();
        if (fs != null) for (File f : fs) deleteQuietly(f);
    }

    // ---------------------------------------------------------------- dọn

    @PluginMethod
    public void cleanup(PluginCall call) {
        io.execute(() -> {
            try {
                long running = runningBuild();
                File[] fs = updatesDir().listFiles();
                if (fs != null) {
                    for (File f : fs) {
                        if (ApkUpdateRules.shouldDelete(f.getName(), running)) deleteQuietly(f);
                    }
                }
                deleteVerified();
                // dọn giá trị kỳ vọng của các build đã cũ
                SharedPreferences p = prefs();
                SharedPreferences.Editor ed = p.edit();
                for (String k : new ArrayList<>(p.getAll().keySet())) {
                    if (k.startsWith("sha_") || k.startsWith("size_")) {
                        try {
                            if (Long.parseLong(k.substring(k.indexOf('_') + 1)) <= running) ed.remove(k);
                        } catch (NumberFormatException e) {
                            ed.remove(k);
                        }
                    }
                }
                ed.apply();
                call.resolve();
            } catch (Exception e) {
                call.reject("Không dọn được", "failed", e);
            }
        });
    }
}
