import { useEffect } from "react";

const BRISBANE_TZ = "Australia/Brisbane";
const CUTOFF_MINUTES = 12 * 60 + 30;

function textOf(element) {
  return String(element?.textContent || "").trim();
}

function closestField(element) {
  return element?.closest?.(".f");
}

function brisbaneParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: BRISBANE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    year: value.year,
    month: value.month,
    day: value.day,
    hour: Number(value.hour || 0),
    minute: Number(value.minute || 0),
  };
}

function brisbaneDateKey(date = new Date()) {
  const parts = brisbaneParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(dateKey, days) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function isAfterBrisbaneCutoff(date = new Date()) {
  const parts = brisbaneParts(date);
  return parts.hour * 60 + parts.minute >= CUTOFF_MINUTES;
}

function earliestMilkRunDate(date = new Date()) {
  const today = brisbaneDateKey(date);
  return isAfterBrisbaneCutoff(date) ? addDays(today, 1) : today;
}

function displayDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function setNativeValue(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function requestedMilkRunInput() {
  for (const label of document.querySelectorAll("label")) {
    const text = textOf(label);
    if (text === "Requested Milk Run Date" || text === "Requested Pickup Date" || text === "Date Submitted") {
      return closestField(label)?.querySelector?.('input[type="date"]') || null;
    }
  }
  return null;
}

function enforceMilkRunCutoff({ showPopup = false } = {}) {
  const input = requestedMilkRunInput();
  if (!input) return false;

  const earliest = earliestMilkRunDate();
  input.min = earliest;

  if (!input.value || input.value < earliest) {
    setNativeValue(input, earliest);
    if (showPopup && isAfterBrisbaneCutoff()) {
      window.alert(`The 12:30pm Brisbane cut-off has passed. We've moved this pickup to the next available milk run: ${displayDate(earliest)}.`);
    }
    return true;
  }
  return false;
}

function upsertCutoffNotice(field) {
  if (!field) return;
  const existing = document.getElementById("motoco-cutoff-notice");
  const isLate = isAfterBrisbaneCutoff();
  if (!isLate) {
    existing?.remove();
    return;
  }

  const earliest = earliestMilkRunDate();
  const notice = existing || document.createElement("div");
  notice.id = "motoco-cutoff-notice";
  notice.className = "al al-info motoco-cutoff-notice";
  notice.textContent = `12:30pm Brisbane cut-off has passed, so new pickups will be moved to ${displayDate(earliest)}.`;
  if (!existing) field.insertAdjacentElement("afterend", notice);
}

function injectDriverUxStyles() {
  if (document.getElementById("motoco-driver-ux-overrides")) return;
  const style = document.createElement("style");
  style.id = "motoco-driver-ux-overrides";
  style.textContent = `
    .dw-stats div { background:#f8f6ef !important; border-color:#cfc6b7 !important; box-shadow:none !important; }
    .dw-stats strong { color:#15110d !important; }
    .dw-stats span { color:#6d6257 !important; }
    .dw-alert.soft { background:#e9e2d5 !important; border-color:#cfc6b7 !important; color:#5b5146 !important; }
    .dw-alert:not(.soft) { border-left:4px solid #d70b3c !important; }
    .dw-titlebar h1 { color:#15110d !important; }
    .dw-titlebar h1 span { color:#d70b3c !important; }
    .motoco-cutoff-notice { margin-top:8px; background:rgba(139,105,20,.07); border-color:rgba(139,105,20,.2); color:#8b6914; }
  `;
  document.head.appendChild(style);
}

function patchClientOrderForm() {
  injectDriverUxStyles();

  for (const label of document.querySelectorAll("label")) {
    const text = textOf(label);

    if (text === "Delivery Priority" || text === "Pickup Timing") {
      const field = closestField(label);
      if (field) field.style.display = "none";
    }

    if (text === "Date Submitted" || text === "Requested Pickup Date") {
      label.textContent = "Requested Milk Run Date";
      const field = closestField(label);
      const input = field?.querySelector?.('input[type="date"]');
      if (input) input.setAttribute("aria-label", "Requested Milk Run Date");
      upsertCutoffNotice(field);
    }

    if (text === "Time Submitted") {
      const field = closestField(label);
      if (field) field.style.display = "none";
    }
  }

  for (const node of document.querySelectorAll(".freight-title")) {
    if (textOf(node).includes("Structured Freight Days")) node.textContent = "Milk Run Dates";
  }

  for (const node of document.querySelectorAll(".freight-banner div")) {
    if (textOf(node).includes("Place orders before 12pm")) {
      node.textContent = "Choose the milk run date you want this pickup added to. Orders after 12:30pm Brisbane time move to the next available milk run.";
    }
  }

  enforceMilkRunCutoff();
}

function handleOrderSubmitClick(event) {
  const button = event.target?.closest?.("button");
  if (!button) return;
  const buttonText = textOf(button).toLowerCase();
  if (buttonText.includes("place order") || buttonText.includes("placing order")) {
    enforceMilkRunCutoff({ showPopup: true });
  }
}

export default function ClientOrderDateBridge() {
  useEffect(() => {
    patchClientOrderForm();
    document.addEventListener("click", handleOrderSubmitClick, true);
    const observer = new MutationObserver(patchClientOrderForm);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener("click", handleOrderSubmitClick, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
