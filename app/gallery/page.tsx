import { redirect } from "next/navigation";

// Redirect /gallery to / since the gallery is now the home page
export default function GalleryRedirect() {
  redirect("/");
}
