import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

//biome-ignore lint/style/noNonNullAssertion: Assume it's there
createRoot(document.getElementById("root")!).render(<App />);
