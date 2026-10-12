/**
 * Kurzes Taptic-Feedback. iOS gibt Web-Apps keine Vibrations-API, aber ab iOS 18 löst das Umschalten
 * eines `<input type="checkbox" switch>` – auch über ein verknüpftes Label – die System-Haptik aus.
 * Muss aus einer Nutzeraktion heraus aufgerufen werden (Tipp, Loslassen nach Wischen).
 */
let trigger: HTMLLabelElement | null = null;

export function haptic(): void {
  if (typeof window === "undefined") return;
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(12); // Android
    return;
  }
  if (!trigger) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = "lifeos-haptic";
    input.setAttribute("switch", "");
    input.setAttribute("aria-hidden", "true");
    input.tabIndex = -1;
    input.style.display = "none";
    trigger = document.createElement("label");
    trigger.htmlFor = input.id;
    trigger.style.display = "none";
    trigger.setAttribute("aria-hidden", "true");
    document.body.append(input, trigger);
  }
  trigger.click();
}
