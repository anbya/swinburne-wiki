import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth/next";
import AzureADProvider from "next-auth/providers/azure-ad";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID as string,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET as string,
      tenantId: process.env.AZURE_AD_TENANT_ID as string,
      authorization: {
        params: {
          prompt: "select_account",
        },
      },
      profile: (profile) => {
        return {
          id: profile.sub,
          name: profile.name,
          email: profile.email ?? profile.preferred_username,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
};

export async function getServerSessionSafe() {
  try {
    return await getServerSession(authOptions);
  } catch (error) {
    const digest = (error as { digest?: unknown } | null)?.digest;
    if (digest === "DYNAMIC_SERVER_USAGE") {
      throw error;
    }

    console.error("[auth] getServerSession failed", error);
    return null;
  }
}
