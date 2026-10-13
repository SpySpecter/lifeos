import type { Metadata } from "next";
import { FocusMini } from "@/components/focus/focus-mini";

export const metadata: Metadata = { title: "Fokus" };

export default function FocusPage() {
  return <FocusMini />;
}
