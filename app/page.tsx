import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  const roles = session?.user?.roles ?? [];

  if (roles.includes("vendor") || roles.includes("admin")) redirect("/bookings");
  if (roles.includes("customer_service")) redirect("/dashboard");
  if (roles.includes("logistics")) redirect("/requests");
  redirect("/dashboard");
}
