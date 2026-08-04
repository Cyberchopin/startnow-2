import Link from "next/link";
import { redirect } from "next/navigation";
import { requireChatGPTUser } from "../chatgpt-auth";
import { getResearchOwner } from "../research-auth";
import ResearchConsole from "./research-console";

export const dynamic = "force-dynamic";

async function OwnerGate() {
  let owner = await getResearchOwner();
  if (!owner && process.env.VERCEL === "1") redirect("/research/login");
  if (!owner) {
    await requireChatGPTUser("/research");
    owner = await getResearchOwner();
  }
  if (!owner) {
    return <main className="research-denied"><div><span>403</span><h1>Owner access required.</h1><p>This research console is not part of the public product.</p><Link href="/">Return to Start Now</Link></div></main>;
  }
  return <ResearchConsole ownerName={owner.fullName || owner.displayName} authMode={owner.authMode} />;
}

export default function ResearchPage() {
  return <OwnerGate />;
}
