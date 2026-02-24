import { useState } from 'react';
import '../styles/login.css';

/* ─── Inline SVG Icons ─────────────────────────────────────────── */

const MailIcon = () => (
    <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="M22 7l-10 5L2 7" />
    </svg>
);

const LockIcon = () => (
    <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
);

const GoogleIcon = () => (
    <svg viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 001 12c0 1.77.42 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

const GithubIcon = () => (
    <svg viewBox="0 0 24 24" fill="#09090b">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
);

/* ─── Component ────────────────────────────────────────────────── */

export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [remember, setRemember] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // TODO: Integrate auth
    };

    return (
        <div className="login-page">
            {/* ================= LEFT — WHITE ================= */}
            <div className="login-left">
                <div className="login-left-inner">
                    {/* Logo */}
                    <div className="login-logo">
                        <img src="/logo_b.png" alt="Memron" className="login-logo-img" />
                        <span className="login-logo-text">Memron</span>
                    </div>

                    {/* Heading */}
                    <h1 className="login-title">Sign in</h1>
                    <p className="login-subtitle">
                        The unified memory layer for the AI era.
                    </p>

                    {/* Form */}
                    <form className="login-form" onSubmit={handleSubmit}>
                        {/* Email */}
                        <div className="login-field">
                            <label className="login-label" htmlFor="login-email">Email</label>
                            <div className="login-input-wrap">
                                <MailIcon />
                                <input
                                    id="login-email"
                                    type="email"
                                    className="login-input"
                                    placeholder="your@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div className="login-field">
                            <label className="login-label" htmlFor="login-password">Password</label>
                            <div className="login-input-wrap">
                                <LockIcon />
                                <input
                                    id="login-password"
                                    type="password"
                                    className="login-input"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                />
                            </div>
                        </div>

                        {/* Remember / Forgot */}
                        <div className="login-meta-row">
                            <label className="login-checkbox-label">
                                <input
                                    type="checkbox"
                                    className="login-checkbox"
                                    checked={remember}
                                    onChange={(e) => setRemember(e.target.checked)}
                                />
                                Remember me
                            </label>
                            <a href="#" className="login-forgot">Forgot Password</a>
                        </div>

                        {/* Submit */}
                        <button type="submit" className="login-btn">
                            Log in to Memron
                        </button>

                        {/* Divider */}
                        <div className="login-divider">
                            <div className="login-divider-line" />
                            <span className="login-divider-text">or</span>
                            <div className="login-divider-line" />
                        </div>

                        {/* Social buttons */}
                        <div className="login-social-row">
                            <button type="button" className="login-social-btn">
                                <span className="login-badge">Last used</span>
                                <GoogleIcon />
                                Continue with Google
                            </button>
                            <button type="button" className="login-social-btn">
                                <GithubIcon />
                                Continue with Github
                            </button>
                        </div>
                    </form>

                    {/* Footer */}
                    <div className="login-footer">
                        <p className="login-footer-text">
                            By continuing, you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.
                        </p>
                    </div>
                </div>
            </div>

            {/* ================= RIGHT — BLACK ================= */}
            <div className="login-right">
                {/* Watermark logo */}
                <img src="/logo_w.png" alt="" className="login-watermark" aria-hidden="true" />

                <div className="login-right-content">
                    {/* Brand */}
                    <div className="login-brand">Memron AI</div>

                    {/* Headline */}
                    <h2 className="login-headline">
                        Persistent memory for<br />AI agents.
                    </h2>

                    {/* Description */}
                    <p className="login-desc">
                        Retain context across conversations, learn from every interaction,
                        and transfer knowledge seamlessly between platforms — all encrypted
                        and owned by you.
                    </p>

                    {/* Stats */}
                    <div className="login-stats">
                        <div className="login-stat-item">
                            <div className="login-stat-val">89-95<span className="accent">%</span></div>
                            <div className="login-stat-label">Token Compression</div>
                        </div>
                        <div className="login-stat-item">
                            <div className="login-stat-val">10-100<span className="accent">x</span></div>
                            <div className="login-stat-label">Cost Reduction</div>
                        </div>
                        <div className="login-stat-item">
                            <div className="login-stat-val">Zero<span className="accent">-</span>Trust</div>
                            <div className="login-stat-label">Encryption</div>
                        </div>
                    </div>

                    {/* Feature card */}
                    <div className="login-card">
                        <h3 className="login-card-title">
                            Stop building retrieval from scratch.
                        </h3>
                        <p className="login-card-desc">
                            Start a project in Cursor, continue in Claude, share with your
                            team on Copilot. Your memory follows you everywhere.
                        </p>
                        <div className="login-pills">
                            <span className="login-pill">Cursor</span>
                            <span className="login-pill-dot" />
                            <span className="login-pill">Claude</span>
                            <span className="login-pill-dot" />
                            <span className="login-pill">Copilot</span>
                            <span className="login-pill-dot" />
                            <span className="login-pill">Windsurf</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
