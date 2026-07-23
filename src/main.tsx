import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { initPersistence } from "./save/persistence";
import "./styles/app.css";

void initPersistence();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
