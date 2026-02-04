"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function SeedFlashCleaner() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  useEffect(() => {
    const seed = sp.get("seed");
    if (!seed) return;

    // remove seed/c/s/msg da URL mantendo o resto
    const next = new URLSearchParams(sp.toString());
    next.delete("seed");
    next.delete("c");
    next.delete("s");
    next.delete("msg");

    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
