import { Dashboard } from "@/components/Dashboard";
import { dataset } from "@/lib/data";

export default function Home() {
  return <Dashboard data={dataset} />;
}
