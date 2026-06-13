import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function RootPage() {
  const headersList = await headers();
  const hostname = headersList.get("host") ?? "";
  if (hostname.startsWith("portal.")) {
    redirect("/portal");
  }
  redirect("/dashboard");
}
