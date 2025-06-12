import { ConvexClient } from "convex/browser";
import { FunctionReference } from "convex/server";

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


export type ConvexAuthState = "authenticated" | "unauthenticated" | "loading"

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


export type EmptyObject = Record<string, never>;

export type OptionalRestArgsOrSkip<FuncRef extends FunctionReference<any>> =
  FuncRef["_args"] extends EmptyObject
  ? [args?: EmptyObject | "skip"]
  : [args: FuncRef["_args"] | "skip"];
