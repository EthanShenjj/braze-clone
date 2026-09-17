import { Suspense } from "react";
import Dashboard from "../ui/dashboard";

export default function RoutedPage() {
  return <Suspense fallback={null}><Dashboard /></Suspense>;
}
