"use client";

import type { ReactNode } from "react";
import { CommandPalette } from "./CommandPalette";

export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <>
      <CommandPalette />
      {children}
    </>
  );
}
