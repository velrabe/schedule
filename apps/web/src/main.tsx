import { render } from "preact";
import App from "./App";
import "./styles.css";
import "./chat-styles.css";

const root = document.getElementById("app");
if (!root) throw new Error("#app not found");
render(<App />, root);
