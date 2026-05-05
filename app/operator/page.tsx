import { redirect } from "next/navigation";

// /operator was the original home for the chat. The chat now lives at "/"
// (it's the primary face of the app). Redirect any old links so nothing
// breaks.
export default function OperatorRedirect() {
  redirect("/");
}
