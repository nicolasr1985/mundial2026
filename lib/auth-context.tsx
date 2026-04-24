// lib/auth-context.tsx
"use client";
import { createContext, useContext } from "react";
import type { User } from "firebase/auth";
import type { UserProfile } from "./firebase";

export interface AuthCtx {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

export const AuthContext = createContext<AuthCtx>({ user: null, profile: null, loading: true });
export const useAuth = () => useContext(AuthContext);
