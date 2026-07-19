import { prisma } from "@/lib/prisma";
import { signAuthToken } from "@/lib/auth";

export type OAuthCustomerProvider = "google" | "apple";

export type VerifiedOAuthProfile = {
  provider: OAuthCustomerProvider;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

export type OAuthCustomerResult = {
  token: string;
  user: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    role: "CUSTOMER";
  };
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function fallbackNameFromEmail(email: string) {
  const [name] = email.split("@");
  return name ? name.replace(/[._-]+/g, " ").trim() || "Customer" : "Customer";
}

export async function signInOAuthCustomer(
  profile: VerifiedOAuthProfile
): Promise<OAuthCustomerResult> {
  if (!profile.emailVerified) {
    throw new Error("OAuth email must be verified.");
  }

  const email = normalizeEmail(profile.email);
  const displayName = profile.name?.trim() || fallbackNameFromEmail(email);

  const linkedAccount = await prisma.customerOAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          role: true,
        },
      },
    },
  });

  if (linkedAccount) {
    if (linkedAccount.user.role !== "CUSTOMER") {
      throw new Error("OAuth sign-in is only available for customer accounts.");
    }

    await prisma.customerOAuthAccount.update({
      where: { id: linkedAccount.id },
      data: {
        email,
        emailVerified: profile.emailVerified,
      },
    });

    const token = signAuthToken(linkedAccount.user.id, linkedAccount.user.role);

    return {
      token,
      user: {
        ...linkedAccount.user,
        role: "CUSTOMER",
      },
    };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
    },
  });

  if (existingUser) {
    if (existingUser.role !== "CUSTOMER") {
      throw new Error("OAuth sign-in is only available for customer accounts.");
    }

    await prisma.customerOAuthAccount.create({
      data: {
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
        email,
        emailVerified: profile.emailVerified,
        userId: existingUser.id,
      },
    });

    const token = signAuthToken(existingUser.id, existingUser.role);

    return {
      token,
      user: {
        ...existingUser,
        role: "CUSTOMER",
      },
    };
  }

  const createdUser = await prisma.user.create({
    data: {
      name: displayName,
      email,
      phone: null,
      passwordHash: null,
      role: "CUSTOMER",
      oauthAccounts: {
        create: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
          email,
          emailVerified: profile.emailVerified,
        },
      },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      role: true,
    },
  });

  const token = signAuthToken(createdUser.id, createdUser.role);

  return {
    token,
    user: {
      ...createdUser,
      role: "CUSTOMER",
    },
  };
}
