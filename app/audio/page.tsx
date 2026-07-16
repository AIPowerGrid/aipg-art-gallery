import type { Metadata } from "next";
import { AudioStudio } from "./AudioStudio";

export const metadata: Metadata = {
  title: "Music Studio | AI Power Grid",
  description: "Create original music with distributed ACE-Step workers on AI Power Grid.",
};

export default function AudioPage() {
  return <AudioStudio />;
}
