'use client';
import { useEffect, useRef } from "react";
import Lenis from "lenis";

export default function useLenis() {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: true,
      // controls smoothing speed
    });

    lenisRef.current = lenis;

    // Optional debug:
    // lenis.on("scroll", (e) => console.log(e));

    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  return lenisRef;
}
