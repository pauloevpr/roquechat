import { ConvexClient } from "convex/browser";

export type AuthTokenFetcher = (args: {
  forceRefreshToken: boolean;
}) => Promise<string | null | undefined>;

export type SignInResult = {
  redirect?: string,
  verifier?: string,
  tokens?: {
    token: string,
    refreshToken: string
  }
}

export type Value =
  | null
  | bigint
  | number
  | boolean
  | string
  | ArrayBuffer
  | Value[]
  | { [key: string]: undefined | Value };


export type ConvexAuthState = "authenticated" | "unauthenticated" | "loading",

export type SignInParams =
  | FormData
  | (Record<string, Value> & {
    redirectTo?: string;
    code?: string;
  })

export type ConvexContextValue = {
  convex: ConvexClient,
  auth: {
    state: ConvexAuthState,
    signIn(provider: string, params?: SignInParams): Promise<void>;
    signOut(): Promise<void>;
  }
}