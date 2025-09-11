import React from "react";
import FloatingNavbar from "./FloatingNavbar";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const NavBarComponent = async () => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <FloatingNavbar user={user} />;
};

export default NavBarComponent;
