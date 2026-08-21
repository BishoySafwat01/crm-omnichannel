import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("🔥 [React Error Boundary Caught Crash]:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center font-sans" dir="rtl">
          <div className="bg-slate-800/90 border border-rose-500/40 rounded-2xl p-8 max-w-xl shadow-2xl backdrop-blur-xl space-y-4">
            <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
              ⚠️
            </div>
            <h1 className="text-xl font-bold text-rose-300">حدث خطأ أثناء تحميل الواجهة</h1>
            <p className="text-xs text-slate-400">
              تم رصد خطأ برمجي أثناء تصيير الصفحة:
            </p>
            <div className="bg-slate-950 p-4 rounded-xl text-left font-mono text-[11px] text-rose-400 overflow-x-auto border border-slate-800 dir-ltr">
              {this.state.error?.toString() || "Unknown Runtime Error"}
            </div>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold rounded-xl transition shadow-lg"
            >
              تفريغ الذاكرة المؤقتة وإعادة المحاولة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
