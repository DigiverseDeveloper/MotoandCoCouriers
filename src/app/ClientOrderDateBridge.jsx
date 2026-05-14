import { useEffect } from "react";

function textOf(element) {
  return String(element?.textContent || "").trim();
}

function closestField(element) {
  return element?.closest?.(".f");
}

function patchClientOrderForm() {
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
      node.textContent = "Choose the milk run date you want this pickup added to.";
    }
  }
}

export default function ClientOrderDateBridge() {
  useEffect(() => {
    patchClientOrderForm();
    const observer = new MutationObserver(patchClientOrderForm);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
