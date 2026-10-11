import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Homescreen-Icon für iPhone/iPad (PNG, weil iOS kein SVG-Touch-Icon kennt). */
export default function AppleIcon() {
  const tile = (bg: string) => <div style={{ width: 48, height: 48, borderRadius: 12, background: bg }} />;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", background: "#111110", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", gap: 12 }}>
            {tile("#3987e5")}
            {tile("#fcfcfb")}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {tile("#fcfcfb")}
            {tile("#199e70")}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
