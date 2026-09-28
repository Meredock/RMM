"use client";

import { createContext, useContext } from "react";

export interface ClientSession {
  username?: string;
  role?: "ADMIN" | "TECH";
}

const SessionContext = createContext<ClientSession>({});

// SessionProvider exposes the signed-in user to client pages so they can hide
// actions the API would refuse. The API is still the enforcement point.
export function SessionProvider({ value, children }: { value: ClientSession; children: React.ReactNode }) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): ClientSession & { isAdmin: boolean } {
  const session = useContext(SessionContext);
  return { ...session, isAdmin: session.role === "ADMIN" };
}
