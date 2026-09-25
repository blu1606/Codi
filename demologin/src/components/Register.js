import React from 'react';

const Register = ({ onNavigate }) => {
  return (
    <>
      <div className="auth-header">
        <div className="auth-logo">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <line x1="19" y1="8" x2="19" y2="14" />
            <line x1="22" y1="11" x2="16" y2="11" />
          </svg>
        </div>
        <h2>Join Our Community</h2>
        <p>Create a new student account</p>
      </div>

      <form className="auth-form" onSubmit={(e) => { e.preventDefault(); onNavigate('otp'); }}>
        <div className="input-group">
          <label htmlFor="fullname">Full Name</label>
          <input type="text" id="fullname" placeholder="John Doe" required />
        </div>
        <div className="input-group">
          <label htmlFor="reg-email">Email Address</label>
          <input type="email" id="reg-email" placeholder="student@university.edu" required />
        </div>
        <div className="input-group">
          <label htmlFor="reg-password">Password</label>
          <input type="password" id="reg-password" placeholder="••••••••" required />
        </div>
        <div className="input-group">
          <label htmlFor="confirm-password">Confirm Password</label>
          <input type="password" id="confirm-password" placeholder="••••••••" required />
        </div>
        <button type="submit" className="auth-button">Create Account</button>
      </form>

      <div className="auth-divider">OR</div>

      <div className="social-login">
        <button type="button" className="social-btn" onClick={() => onNavigate('otp')}>
          <svg className="icon-google" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Sign up with Google
        </button>
      </div>

      <div className="auth-footer">
        Already have an account?
        <button type="button" onClick={() => onNavigate('login')}>Log In</button>
      </div>
    </>
  );
};

export default Register;
