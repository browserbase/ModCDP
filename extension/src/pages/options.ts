// MODCDP_TS_ONLY: DO NOT TRANSLATE THIS FILE TO OTHER LANGUAGES.
// Reason: only runs in browser.
type RuntimeJSON = {
  type?: string;
  config?: unknown;
  state?: unknown;
  children?: Record<string, RuntimeJSON>;
};

const out = document.getElementById("out")!;

function renderObject(title: string, value: unknown) {
  const details = document.createElement("details");
  details.open = true;
  const summary = document.createElement("summary");
  summary.textContent = title;
  details.append(summary);
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(value ?? {}, null, 2);
  details.append(pre);
  return details;
}

function renderNode(node: RuntimeJSON) {
  const section = document.createElement("section");
  const heading = document.createElement("h2");
  heading.textContent = node.type ?? "Unknown";
  section.append(heading);
  section.append(renderObject("config", node.config ?? {}));
  section.append(renderObject("state", node.state ?? {}));
  for (const [name, child] of Object.entries(node.children ?? {})) {
    const child_section = renderNode(child);
    const label = document.createElement("h3");
    label.textContent = name;
    child_section.prepend(label);
    section.append(child_section);
  }
  return section;
}

const load = () =>
  chrome.runtime.sendMessage({ type: "modcdp.options.status" }, (status) => {
    out.replaceChildren(renderNode(status || { type: "Error", state: chrome.runtime.lastError }));
  });
document.getElementById("refresh")!.onclick = load;
load();
setInterval(load, 2000);
