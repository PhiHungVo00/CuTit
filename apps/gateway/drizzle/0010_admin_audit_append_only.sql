-- Dự án 5a: nhật ký quản trị CHỈ THÊM, ép ở DB (spec §5.5). Migration viết tay (drizzle-kit generate --custom).
-- Chặn UPDATE/DELETE từng dòng và TRUNCATE; chỉ hàm admin_audit_purge(before) xóa được (job dọn bản quá 2 năm).
-- Lưu ý vận hành: hàm là SECURITY DEFINER nên chạy với quyền chủ bảng; vai trò DB của Gateway phải là chủ bảng
-- (cũng là vai trò chạy migration) — các vai trò khác không có quyền gọi (REVOKE ... FROM PUBLIC).
CREATE FUNCTION admin_audit_block_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log là nhật ký chỉ thêm: không được % dữ liệu', TG_OP USING ERRCODE = 'restrict_violation';
END;
$$;--> statement-breakpoint
CREATE TRIGGER admin_audit_log_no_row_change BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION admin_audit_block_change();--> statement-breakpoint
CREATE TRIGGER admin_audit_log_no_truncate BEFORE TRUNCATE ON admin_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION admin_audit_block_change();--> statement-breakpoint
CREATE FUNCTION admin_audit_purge(before timestamptz) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  n bigint;
BEGIN
  -- Tắt trigger chỉ trong transaction của lần gọi này (DDL có tính giao dịch: lỗi/rollback thì trigger vẫn bật).
  ALTER TABLE public.admin_audit_log DISABLE TRIGGER admin_audit_log_no_row_change;
  DELETE FROM public.admin_audit_log WHERE created_at < before;
  GET DIAGNOSTICS n = ROW_COUNT;
  ALTER TABLE public.admin_audit_log ENABLE TRIGGER admin_audit_log_no_row_change;
  RETURN n;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION admin_audit_purge(timestamptz) FROM PUBLIC;
