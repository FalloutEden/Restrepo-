import { redirect } from "next/navigation";

// /operator was the original home for the chat. The chat now lives at
// /dashboard (the customer-facing operator surface). Root "/" is the
// public marketing/payment landing — sending logged-in users there
// strands them on the payment page mid-session.
export default function OperatorRedirect() {
  redirect("/dashboard");
}
