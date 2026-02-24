# Clerk Authentication Setup Guide

This guide will help you set up Clerk authentication for the Memron.ai landing page.

## Prerequisites

- Node.js 18+ installed
- pnpm installed (`npm install -g pnpm`)
- A Clerk account (free tier available)

## Step 1: Create a Clerk Account

1. Go to [https://clerk.com](https://clerk.com)
2. Sign up for a free account
3. Create a new application
4. Choose "Next.js" as your framework

## Step 2: Configure OAuth Providers

In your Clerk dashboard, navigate to **User & Authentication > Social Connections** and enable:

1. **GitHub**
   - Click "Enable" on GitHub
   - Follow the instructions to create a GitHub OAuth App
   - Add the callback URL provided by Clerk

2. **Google**
   - Click "Enable" on Google
   - Follow the instructions to create a Google OAuth Client
   - Add the authorized redirect URIs provided by Clerk

## Step 3: Get Your API Keys

1. In your Clerk dashboard, go to **API Keys**
2. Copy your **Publishable Key** (starts with `pk_test_` or `pk_live_`)
3. Copy your **Secret Key** (starts with `sk_test_` or `sk_live_`)

## Step 4: Configure Environment Variables

1. Create a `.env.local` file in the `apps/landing` directory:

```bash
cd apps/landing
touch .env.local
```

2. Add your Clerk API keys to `.env.local`:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_publishable_key_here
CLERK_SECRET_KEY=sk_test_your_secret_key_here

# Clerk URLs (these are already configured for custom UI)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/login
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
```

> **Important:** Never commit `.env.local` to version control! It's already in `.gitignore`.

## Step 5: Install Dependencies

From the root of the monorepo:

```bash
pnpm install
```

## Step 6: Start the Development Server

```bash
cd apps/landing
pnpm dev
```

The landing page will be available at `http://localhost:3000`

## Testing the Authentication Flow

### Test Sign Up

1. Navigate to `http://localhost:3000`
2. Click "Get Early Access" button
3. Try signing up with:
   - **Email/Password**: Fill in the form and verify your email
   - **GitHub**: Click "Continue with GitHub"
   - **Google**: Click "Continue with Google"
4. After successful sign up, you'll be redirected to `/dashboard`

### Test Sign In

1. Navigate to `http://localhost:3000/login`
2. Sign in with your credentials
3. You'll be redirected to `/dashboard`

### Test Password Reset

1. Navigate to `http://localhost:3000/forgot-password`
2. Enter your email address
3. Check your email for the reset code
4. Enter the code and create a new password

### Test Route Protection

1. While signed in, navigate to `/dashboard`
2. Try clicking the browser's back button
3. You should NOT be redirected back to `/login` or landing page
4. Sign out and try accessing `/dashboard` directly
5. You should be redirected to `/login`

## Authentication Pages

The following custom authentication pages have been created:

- **`/login`** - Sign in page with email/password and OAuth
- **`/sign-up`** - Sign up page with email verification
- **`/forgot-password`** - Password reset flow
- **`/dashboard`** - Protected dashboard (requires authentication)
- **`/sso-callback`** - OAuth callback handler

## Middleware Configuration

The middleware (`apps/landing/src/middleware.ts`) handles:

- **Public Routes**: `/`, `/login`, `/sign-up`, `/forgot-password`, `/sso-callback`
- **Protected Routes**: `/dashboard` and all sub-routes
- **Redirect Logic**:
  - Authenticated users trying to access `/login` or `/sign-up` → redirected to `/dashboard`
  - Unauthenticated users trying to access `/dashboard` → redirected to `/login`
  - No back navigation to auth pages after successful login

## Customization

### Appearance

The Clerk UI uses a dark theme configured in `apps/landing/src/app/layout.tsx`:

```tsx
<ClerkProvider
  appearance={{
    variables: {
      colorPrimary: '#6366f1',     // Indigo
      colorBackground: '#09090b',   // Dark zinc
      colorText: '#ffffff',         // White
    },
  }}
>
```

### Custom Components

All authentication pages use custom UI components built with:
- Tailwind CSS
- Clerk React hooks (`useSignIn`, `useSignUp`, `useUser`)
- Next.js App Router

## Troubleshooting

### Issue: "Invalid publishable key"

**Solution:** Make sure you copied the correct publishable key from your Clerk dashboard and it starts with `pk_test_` or `pk_live_`.

### Issue: OAuth redirect not working

**Solution:** 
1. Check that you've enabled the OAuth provider in Clerk dashboard
2. Verify the callback URLs are correctly configured
3. Make sure you're using `http://localhost:3000` during development

### Issue: Session not persisting

**Solution:**
1. Clear browser cookies and local storage
2. Restart the development server
3. Check that middleware is properly configured

### Issue: Email verification not working

**Solution:**
1. Check your spam folder
2. Make sure you've configured email settings in Clerk dashboard
3. In development, you can use Clerk's development inbox

## Production Deployment

Before deploying to production:

1. **Update Environment Variables**:
   - Replace test keys with production keys (`pk_live_` and `sk_live_`)
   - Update URLs to your production domain

2. **Configure Vercel**:
   ```bash
   vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
   vercel env add CLERK_SECRET_KEY
   ```

3. **Update Clerk Dashboard**:
   - Add your production domain to allowed origins
   - Update OAuth callback URLs for production

4. **Enable Production Features**:
   - Set up custom SMTP for emails
   - Configure session management
   - Enable MFA (optional)

## Additional Resources

- [Clerk Documentation](https://clerk.com/docs)
- [Clerk Next.js Quickstart](https://clerk.com/docs/quickstarts/nextjs)
- [Clerk Dashboard](https://dashboard.clerk.com)

## Support

For issues specific to Clerk integration:
- Check [Clerk's Discord](https://clerk.com/discord)
- Review [Clerk's GitHub Discussions](https://github.com/clerkinc/javascript/discussions)

For issues specific to Memron.ai:
- Open an issue in the GitHub repository
- Contact the development team
