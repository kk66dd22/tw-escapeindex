import { useMemo } from "react";

export function useAuth() {
  return useMemo(() => ({
    user: null,
    loading: false,
    error: null,
    isAuthenticated: false,
    refresh: async () => null,
    logout: async () => undefined,
  }), []);
}
