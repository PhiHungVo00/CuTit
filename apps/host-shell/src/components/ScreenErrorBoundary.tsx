import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { t } from '../i18n';

interface Props {
  children: ReactNode;
  /** Đổi key (ví dụ pathname) để tự xóa lỗi khi người dùng sang màn hình khác */
  resetKey: string;
}

interface State {
  error: Error | null;
}

/** Mở Góp ý ở loại "Báo lỗi", kèm tên lỗi + stack (qua state điều hướng, không qua URL; FeedbackRoute lười rút gọn còn tên + dòng đầu) */
function ReportBugButton({ error }: { error: Error }) {
  const navigate = useNavigate();
  return (
    <button className="btn" onClick={() => navigate('/gop-y?loai=loi', { state: { error: { name: error.name, stack: (error.stack ?? '').slice(0, 2000) } } })}>
      {t('reportBug')}
    </button>
  );
}

/**
 * Cô lập lỗi của từng remote: một màn hình hỏng (hoặc chunk tải thất bại khi mất mạng)
 * không làm trắng cả ứng dụng.
 */
export class ScreenErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Shell] Màn hình gặp lỗi', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const chunkFailed = /dynamically imported module|Loading chunk|Failed to fetch/i.test(
      this.state.error.message
    );
    return (
      <div className="screen-fallback" role="alert">
        <p>
          {chunkFailed ? t('chunkFailed') : t('screenError')}
        </p>
        <button className="btn" onClick={() => window.location.reload()}>
          {t('retry')}
        </button>
        <ReportBugButton error={this.state.error} />
      </div>
    );
  }
}
