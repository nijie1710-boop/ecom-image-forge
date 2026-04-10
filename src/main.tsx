import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./i18n";
import "./index.css";

// ============================================================
// 运行时防御：禁用浏览器自动翻译
// ------------------------------------------------------------
// Chrome / Google Translate 会把文本节点包进 <font> 标签，
// 导致 React reconcile 时 insertBefore 找不到参考节点，
// 抛 NotFoundError 后整个 root unmount，页面变白。
// 除了 index.html 里的 meta/attr，这里再做一层运行时兜底。
// ============================================================
if (typeof document !== "undefined") {
  document.documentElement.setAttribute("translate", "no");
  document.documentElement.classList.add("notranslate");
}

const root = document.getElementById("root");
if (root) {
  root.setAttribute("translate", "no");
  root.classList.add("notranslate");
  createRoot(root).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}
