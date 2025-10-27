'use client';
import React from "react";
import useLenis from "@/hooks/use-lenis";
import 'lenis/dist/lenis.css';

export default function LenisProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useLenis(); // initialize Lenis once
  return <>{children}</>;
}
