package vn.edu.uit.becutit;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

public class ApkUpdateRulesTest {
    private static final List<String> HOSTS = Arrays.asList("cdn.becutit.vn", "Tai.Becutit.vn");

    private static String rep(char c, int n) {
        char[] a = new char[n];
        Arrays.fill(a, c);
        return new String(a);
    }

    @Test public void releaseChiHttpsVaHostTrongDanhSach() {
        assertNull(ApkUpdateRules.checkUrl("https://cdn.becutit.vn/tai/becutit-1.4.2.apk", false, HOSTS));
        assertNull(ApkUpdateRules.checkUrl("https://TAI.becutit.vn/a.apk", false, HOSTS));
        assertEquals("invalid_args", ApkUpdateRules.checkUrl("http://cdn.becutit.vn/a.apk", false, HOSTS));
        assertEquals("host_not_allowed", ApkUpdateRules.checkUrl("https://evil.example/a.apk", false, HOSTS));
        assertEquals("host_not_allowed", ApkUpdateRules.checkUrl("https://cdn.becutit.vn.evil.example/a.apk", false, HOSTS));
    }

    @Test public void releaseDanhSachRongTuChoiHet() {
        assertEquals("host_not_allowed", ApkUpdateRules.checkUrl("https://cdn.becutit.vn/a.apk", false, Collections.<String>emptyList()));
        assertEquals("host_not_allowed", ApkUpdateRules.checkUrl("https://cdn.becutit.vn/a.apk", false, null));
    }

    @Test public void debugChoHttpVaHostBatKyKhiDanhSachRong() {
        assertNull(ApkUpdateRules.checkUrl("http://10.0.2.2:8080/becutit-1004001.apk", true, Collections.<String>emptyList()));
        assertEquals("host_not_allowed", ApkUpdateRules.checkUrl("http://10.0.2.2:8080/a.apk", true, HOSTS));
        assertEquals("invalid_args", ApkUpdateRules.checkUrl("ftp://10.0.2.2/a.apk", true, null));
    }

    @Test public void urlHongBiTuChoi() {
        assertEquals("invalid_args", ApkUpdateRules.checkUrl(null, false, HOSTS));
        assertEquals("invalid_args", ApkUpdateRules.checkUrl("", false, HOSTS));
        assertEquals("invalid_args", ApkUpdateRules.checkUrl("https://", false, HOSTS));
        assertEquals("invalid_args", ApkUpdateRules.checkUrl("https://cdn.becutit.vn@evil.example/a.apk", false, HOSTS));
        assertEquals("invalid_args", ApkUpdateRules.checkUrl("file:///sdcard/a.apk", true, null));
        assertEquals("invalid_args", ApkUpdateRules.checkUrl("javascript:alert(1)", true, null));
    }

    @Test public void sha256VaBuildVaKichThuoc() {
        assertTrue(ApkUpdateRules.isValidSha256(rep('a', 64)));
        assertFalse(ApkUpdateRules.isValidSha256(rep('a', 63)));
        assertFalse(ApkUpdateRules.isValidSha256(rep('g', 64)));
        assertFalse(ApkUpdateRules.isValidSha256(null));
        assertTrue(ApkUpdateRules.isValidBuild(1004002));
        assertFalse(ApkUpdateRules.isValidBuild(0));
        assertFalse(ApkUpdateRules.isValidBuild(-5));
        assertTrue(ApkUpdateRules.isValidSize(1));
        assertFalse(ApkUpdateRules.isValidSize(0));
        assertFalse(ApkUpdateRules.isValidSize(ApkUpdateRules.MAX_APK_BYTES + 1));
    }

    @Test public void tenTepChiTheoBuild() {
        assertEquals("becutit-1004002.apk", ApkUpdateRules.fileName(1004002));
        assertEquals(new File("x", "becutit-7.apk"), ApkUpdateRules.fileFor(new File("x"), 7));
        assertEquals(1004002L, ApkUpdateRules.buildFromFileName("becutit-1004002.apk"));
        assertEquals(-1L, ApkUpdateRules.buildFromFileName("../becutit-1.apk"));
        assertEquals(-1L, ApkUpdateRules.buildFromFileName("becutit-1.apk.tmp"));
        assertEquals(-1L, ApkUpdateRules.buildFromFileName(null));
    }

    @Test public void donDepXoaCuVaTepLa() {
        assertTrue(ApkUpdateRules.shouldDelete("becutit-1000000.apk", 1000000)); // bằng bản đang chạy
        assertTrue(ApkUpdateRules.shouldDelete("becutit-999999.apk", 1000000));
        assertTrue(ApkUpdateRules.shouldDelete("rac.txt", 1000000));
        assertFalse(ApkUpdateRules.shouldDelete("becutit-1000001.apk", 1000000)); // mới hơn: giữ
    }

    @Test public void sha256VaSoSanh() throws Exception {
        byte[] data = "abc".getBytes("UTF-8");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        long[] n = new long[1];
        String h = ApkUpdateRules.copyAndHash(new ByteArrayInputStream(data), out, n);
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", h);
        assertEquals(3L, n[0]);
        assertArrayEquals(data, out.toByteArray());
        assertTrue(ApkUpdateRules.matches(h, 3, h.toUpperCase(), 3));
        assertFalse(ApkUpdateRules.matches(h, 4, h, 3));
        assertFalse(ApkUpdateRules.matches(h, 3, rep('0', 64), 3));
    }
}
