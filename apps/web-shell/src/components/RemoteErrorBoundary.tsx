import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  remoteName: string;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class RemoteErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    errorMessage: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Dev-only trace: giữ remoteName để debug module nào lỗi (không render lên UI)
    console.error(`[RemoteErrorBoundary] Lỗi tại ${this.props.remoteName}:`, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-md mx-auto my-8 p-6 bg-[#271008] border-2 border-[#e56c5e]/40 rounded-2xl text-center shadow-xl">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#e56c5e]/20 flex items-center justify-center text-2xl text-[#e56c5e]">
            ⚠️
          </div>
          <h3 className="text-lg font-bold text-white mb-2">
            Không tải được màn hình này
          </h3>
          <p className="text-xs text-[#ffb4aa] mb-4 font-mono bg-black/30 p-2 rounded text-left overflow-auto max-h-24">
            {this.state.errorMessage || 'Lỗi không xác định khi kết nối module từ xa.'}
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 bg-[#e56c5e] text-[#410002] rounded-xl text-xs font-bold hover:brightness-110 active:scale-95 transition-all shadow"
            >
              🔄 Thử tải lại màn hình
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
