package vn.edu.uit.becutit;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.security.MessageDigest;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Luật thuần Java (không phụ thuộc Android) của cầu nối tự cập nhật APK, để kiểm bằng test đơn vị.
 * Công cụ tự viết, không chép mã ngoài.
 */
final class ApkUpdateRules {
    private ApkUpdateRules() {}

    /** Trần kích thước APK chấp nhận (không để máy chủ sai khiến app tải/đọc vô hạn). */
    static final long MAX_APK_BYTES = 300L * 1024 * 1024;

    private static final Pattern SHA256 = Pattern.compile("^[0-9a-fA-F]{64}$");
    private static final Pattern FILE_NAME = Pattern.compile("^becutit-(\\d{1,10})\\.apk$");

    static boolean isValidSha256(String s) {
        return s != null && SHA256.matcher(s).matches();
    }

    static boolean isValidBuild(long build) {
        return build > 0 && build <= 2_100_000_000L;
    }

    static boolean isValidSize(long size) {
        return size > 0 && size <= MAX_APK_BYTES;
    }

    /**
     * Kiểm URL tải. Trả null nếu hợp lệ, hoặc mã lỗi: "invalid_args" | "host_not_allowed".
     * - Release: chỉ https và host phải nằm trong allowedHosts (danh sách rỗng ⇒ từ chối hết).
     * - Debug: cho http (máy chủ thử 10.0.2.2); danh sách rỗng ⇒ không giới hạn host.
     * - Không chấp nhận user:pass@ trong URL.
     */
    static String checkUrl(String url, boolean debug, List<String> allowedHosts) {
        if (url == null || url.length() > 2048) return "invalid_args";
        URI uri;
        try {
            uri = new URI(url);
        } catch (Exception e) {
            return "invalid_args";
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        boolean ok = scheme.equals("https") || (debug && scheme.equals("http"));
        if (!ok) return "invalid_args";
        String host = uri.getHost();
        if (host == null || host.isEmpty() || uri.getUserInfo() != null) return "invalid_args";
        boolean restrict = !(debug && (allowedHosts == null || allowedHosts.isEmpty()));
        if (restrict) {
            boolean listed = false;
            if (allowedHosts != null) {
                for (String h : allowedHosts) {
                    if (h != null && h.trim().equalsIgnoreCase(host)) {
                        listed = true;
                        break;
                    }
                }
            }
            if (!listed) return "host_not_allowed";
        }
        return null;
    }

    /** Tên tệp chỉ theo build — không bao giờ lấy từ dữ liệu bên ngoài (chống path traversal). */
    static String fileName(long build) {
        return "becutit-" + build + ".apk";
    }

    static File fileFor(File dir, long build) {
        return new File(dir, fileName(build));
    }

    /** Build suy từ tên tệp trong thư mục updates, hoặc -1 nếu không phải tệp của mình. */
    static long buildFromFileName(String name) {
        if (name == null) return -1;
        Matcher m = FILE_NAME.matcher(name);
        return m.matches() ? Long.parseLong(m.group(1)) : -1;
    }

    /** Tệp có nên xóa khi dọn: không phải tên của mình, hoặc build ≤ bản đang chạy. */
    static boolean shouldDelete(String name, long runningBuild) {
        long b = buildFromFileName(name);
        return b < 0 || b <= runningBuild;
    }

    /** Đọc in (và ghi ra out nếu khác null) đồng thời tính SHA-256. Trả hex thường; bytesOut[0] = số byte. */
    static String copyAndHash(InputStream in, OutputStream out, long[] bytesOut) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] buf = new byte[64 * 1024];
        long total = 0;
        int n;
        while ((n = in.read(buf)) > 0) {
            md.update(buf, 0, n);
            if (out != null) out.write(buf, 0, n);
            total += n;
            if (total > MAX_APK_BYTES) throw new IOException("too_large");
        }
        if (bytesOut != null && bytesOut.length > 0) bytesOut[0] = total;
        return hex(md.digest());
    }

    static String hex(byte[] b) {
        StringBuilder sb = new StringBuilder(b.length * 2);
        for (byte x : b) sb.append(String.format(Locale.ROOT, "%02x", x));
        return sb.toString();
    }

    /** true khi hash và kích thước khớp kỳ vọng (hex không phân biệt hoa/thường). */
    static boolean matches(String actualHex, long actualSize, String expectedHex, long expectedSize) {
        return actualSize == expectedSize && actualHex != null && actualHex.equalsIgnoreCase(expectedHex);
    }
}
