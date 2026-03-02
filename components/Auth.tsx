import React, { useState } from 'react';
import { supabase } from '../supabaseClient';
import { Loader2, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';

export const Auth: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (isResetMode) {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: window.location.origin,
          });
          if (error) throw error;
          setMessage({ type: 'success', text: 'Password reset link sent! Check your email.' });
      } else if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Check your email for the confirmation link!' });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google') => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl max-w-md w-full border border-gray-700">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">Logistic Mapper</h1>
        <p className="text-gray-400 text-center mb-8">
          {isResetMode ? 'Reset Password' : (isSignUp ? 'Create a new account' : 'Sign in to your account')}
        </p>

        {message && (
          <div className={`p-4 rounded mb-6 flex items-center gap-2 ${message.type === 'error' ? 'bg-red-900/50 text-red-200 border border-red-500' : 'bg-green-900/50 text-green-200 border border-green-500'}`}>
            {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            {message.text}
          </div>
        )}

        <form onSubmit={handleAuth} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 h-5 w-5" />
                <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded pl-10 pr-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="you@example.com"
                />
            </div>
          </div>
          
          {!isResetMode && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 h-5 w-5" />
                    <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded pl-10 pr-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••••"
                    />
                </div>
              </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors flex items-center justify-center"
          >
            {loading ? <Loader2 className="animate-spin h-5 w-5" /> : (isResetMode ? 'Send Reset Link' : (isSignUp ? 'Sign Up' : 'Sign In'))}
          </button>
        </form>

        {!isResetMode && (
            <div className="mt-6">
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-600"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-gray-800 text-gray-400">Or continue with</span>
                </div>
            </div>

            <div className="mt-6">
                <button
                onClick={() => handleOAuth('google')}
                className="w-full inline-flex justify-center py-2 px-4 border border-gray-600 rounded shadow-sm bg-gray-700 text-sm font-medium text-gray-200 hover:bg-gray-600"
                >
                Google
                </button>
            </div>
            </div>
        )}

        <div className="mt-6 text-center space-y-2">
          {!isResetMode ? (
              <>
                <button
                    onClick={() => {
                        setIsSignUp(!isSignUp);
                        setMessage(null);
                    }}
                    className="block w-full text-sm text-blue-400 hover:text-blue-300"
                >
                    {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </button>
                <button
                    onClick={() => {
                        setIsResetMode(true);
                        setMessage(null);
                    }}
                    className="block w-full text-xs text-gray-500 hover:text-gray-300"
                >
                    Forgot your password?
                </button>
              </>
          ) : (
              <button
                onClick={() => {
                    setIsResetMode(false);
                    setMessage(null);
                }}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                Back to Sign In
              </button>
          )}
        </div>
      </div>
    </div>
  );
};
