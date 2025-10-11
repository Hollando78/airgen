import React, { useState } from 'react';
import './styles.css';
import { LoginModal } from './components/LoginModal';
import { SignupModal } from './components/SignupModal';
import { Button } from './components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { Sparkles, Lock, Workflow, Network } from 'lucide-react';

export function LandingPage(): JSX.Element {
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);

  return (
    <>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-neutral-50 via-brand-50/30 to-accent-50/30">
        {/* Navigation */}
        <nav className="border-b border-neutral-200/50 bg-white/80 backdrop-blur-sm sticky top-0 z-40">
          <div className="container mx-auto px-6 py-4 flex justify-between items-center max-w-7xl">
            <div className="flex items-center gap-3">
              <img
                src="/logo.png"
                alt="AIRGen Logo"
                className="w-10 h-10"
              />
              <span className="text-2xl font-bold text-neutral-900 tracking-tight">
                AIRGen
              </span>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setShowLogin(true)}
                className="text-neutral-900 font-semibold border-2 hover:bg-neutral-50"
              >
                Sign In
              </Button>
              <Button
                size="lg"
                onClick={() => setShowSignup(true)}
                className="font-semibold shadow-md hover:shadow-lg px-6"
              >
                Get Started
              </Button>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="flex-1 flex items-center justify-center px-6 py-16 md:py-24 bg-gradient-to-br from-blue-50/50 via-sky-50/30 to-transparent">
          <div className="max-w-6xl w-full">
            <div className="max-w-5xl mx-auto">
              {/* Hero Image */}
              <img
                src="/hero.png"
                alt="AIRGen Platform Interface"
                className="w-full rounded-2xl border border-neutral-200/50 shadow-[0_30px_90px_-10px_rgba(0,0,0,0.5),0_20px_50px_-5px_rgba(59,130,246,0.4)] animate-in fade-in slide-in-from-bottom-4 duration-700 hover:scale-[1.02] transition-transform hover:duration-300"
              />
              <p className="text-center text-xl text-neutral-700 mt-8 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-200 whitespace-nowrap">
                Accelerate your systems engineering workflow with AIRGen's AI-powered studio
              </p>
              <div className="flex justify-center mt-6">
                <Button
                  size="lg"
                  onClick={() => setShowSignup(true)}
                  className="font-semibold shadow-lg hover:shadow-xl px-8 text-lg animate-in fade-in slide-in-from-bottom-2 duration-700 delay-300"
                >
                  Try AIRGen Now
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="border-t border-neutral-200 bg-white/60 backdrop-blur-sm py-8">
          <div className="container mx-auto px-6 text-center text-sm text-neutral-600">
            <p>© 2025 AIRGen Studio. All rights reserved.</p>
          </div>
        </footer>
      </div>

      <LoginModal
        isOpen={showLogin}
        onClose={() => setShowLogin(false)}
        onSwitchToSignup={() => {
          setShowLogin(false);
          setShowSignup(true);
        }}
      />

      <SignupModal
        isOpen={showSignup}
        onClose={() => setShowSignup(false)}
        onSwitchToLogin={() => {
          setShowSignup(false);
          setShowLogin(true);
        }}
      />
    </>
  );
}
