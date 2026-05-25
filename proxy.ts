import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const proxy = withAuth(
  function proxy(request: NextRequest) {
    void request;
    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/announcement-management/:path*",
    "/news-management/:path*",
    "/notification-management/:path*",
    "/notification-group-management/:path*",
    "/user-management/:path*",
  ],
};
