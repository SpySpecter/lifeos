/**
 * Hell/Dunkel folgt immer der Systemeinstellung (Apple: keine app-eigene Darstellungsoption).
 * Läuft vor dem ersten Paint und reagiert auf Wechsel (z. B. „Automatisch“ am Abend).
 */
export const themeScript = `(()=>{try{localStorage.removeItem("lifeos-theme")}catch(e){}var m=matchMedia("(prefers-color-scheme: dark)");var a=function(){var d=m.matches;document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"};a();m.addEventListener("change",a)})()`;
