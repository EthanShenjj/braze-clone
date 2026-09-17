import { Suspense } from "react";
import Dashboard from "./ui/dashboard";

export default function Page() {
  return <Suspense fallback={null}><Dashboard /></Suspense>;
}
