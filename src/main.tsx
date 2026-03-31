import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./i18n";
import "./index.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
