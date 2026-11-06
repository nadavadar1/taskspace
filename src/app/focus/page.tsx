import { Suspense } from "react";
import { FocusView } from "@/components/FocusView";

export default function Page() {
  return (
    <Suspense>
      <FocusView />
    </Suspense>
  );
}
