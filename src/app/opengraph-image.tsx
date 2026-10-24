import { ImageResponse } from "next/og";

export const alt = "Sublime — Pegá tu identidad. Calcos, stickers y productos personalizados.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "#000000",
          color: "#FFFFFF",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, fontWeight: 900 }}>
          <span>SUBLIME®</span>
          <span style={{ color: "#35BDF2" }}>CALCOS · STICKERS</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 150, fontWeight: 900, lineHeight: 0.85, letterSpacing: -8 }}>
          <span>PEGÁ</span>
          <span style={{ color: "#35BDF2" }}>TU IDENTIDAD.</span>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 26 }}>
          <span style={{ background: "#35BDF2", color: "#000000", padding: "8px 16px" }}>Calcos</span>
          <span style={{ background: "#35BDF2", color: "#000000", padding: "8px 16px" }}>Packs</span>
          <span style={{ background: "#35BDF2", color: "#000000", padding: "8px 16px" }}>Remeras</span>
          <span style={{ background: "#35BDF2", color: "#000000", padding: "8px 16px" }}>DTF</span>
          <span style={{ background: "#35BDF2", color: "#000000", padding: "8px 16px" }}>Vinilos</span>
        </div>
      </div>
    ),
    size,
  );
}
