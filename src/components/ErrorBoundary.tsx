import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** 可选：自定义降级 UI */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
  autoRetried: boolean;
}

/** Transient errors that are worth auto-retrying (usually caused by Chrome
 * auto-translate racing with React reconcile). After one silent reset they
 * normally disappear. */
function isTransientDomError(error: Error): boolean {
  const name = error.name || "";
  const message = error.message || "";
  return (
    name === "NotFoundError" ||
    name === "IndexSizeError" ||
    /removeChild|insertBefore|appendChild/.test(message)
  );
}

/**
 * 全局错误边界：捕获子组件渲染过程中抛出的异常，避免整个页面白屏。
 *
 * 典型场景：
 * 1. Chrome / Google 翻译修改 DOM 导致 React reconcile 抛 NotFoundError
 * 2. 后端返回结构不符合预期，组件访问 undefined 属性
 * 3. 第三方组件的运行时异常
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null, autoRetried: false };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 打印到 console，方便在 DevTools / 监控里排查
    console.error("[ErrorBoundary] Caught render error:", error, info);
    this.setState({ componentStack: info.componentStack ?? null });

    // 对于 Chrome 翻译 / DOM race 等瞬态错误，静默自愈一次
    if (!this.state.autoRetried && isTransientDomError(error)) {
      this.setState({ autoRetried: true });
      queueMicrotask(() => {
        this.setState({ error: null, componentStack: null });
      });
    }
  }

  reset = () => {
    this.setState({ error: null, componentStack: null, autoRetried: false });
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset);
    }

    return (
      <div
        role="alert"
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          background: "#f8f9fb",
          color: "#1f2937",
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            padding: "32px 28px",
            borderRadius: 20,
            background: "#ffffff",
            boxShadow: "0 8px 40px rgba(15, 23, 42, 0.08)",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
            页面出现了意外错误
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: "0 0 20px", lineHeight: 1.6 }}>
            已经记录这次错误。你可以尝试刷新页面，或返回工作台首页继续操作。
            <br />
            <span style={{ fontSize: 12, color: "#94a3b8" }}>
              若问题持续出现，请关闭浏览器自动翻译功能后重试。
            </span>
          </p>
          <details
            style={{
              textAlign: "left",
              background: "#f1f5f9",
              borderRadius: 12,
              padding: "10px 14px",
              fontSize: 12,
              color: "#475569",
              marginBottom: 20,
            }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 500 }}>错误详情</summary>
            <pre
              style={{
                margin: "10px 0 0",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
              }}
            >
              {error.name}: {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
              {componentStack ? `\n\n组件栈：${componentStack}` : ""}
            </pre>
          </details>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                appearance: "none",
                border: "none",
                padding: "10px 20px",
                borderRadius: 12,
                background: "#6366f1",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              刷新页面
            </button>
            <button
              type="button"
              onClick={this.reset}
              style={{
                appearance: "none",
                border: "1px solid #e2e8f0",
                padding: "10px 20px",
                borderRadius: 12,
                background: "#ffffff",
                color: "#475569",
                fontSize: 14,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              重试
            </button>
          </div>
        </div>
      </div>
    );
  }
}
