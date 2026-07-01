'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { getVisitorId } from '@/hooks/useVisitor';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export default function ChatWidget() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [visitorId, setVisitorId] = useState<string>('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasGreeted, setHasGreeted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize visitor ID and check session expiration
  useEffect(() => {
    setVisitorId(getVisitorId() || 'v_' + Math.random().toString(36).substring(2) + Date.now().toString(36));

    // Check if session has expired (24 hours)
    const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours in ms
    const sessionStart = localStorage.getItem('lavaca_session_start');
    const now = Date.now();

    if (!sessionStart || now - Number(sessionStart) > SESSION_TTL) {
      // Session expired or missing — clear old conversation, start fresh
      localStorage.removeItem('lavaca_convo_id');
      localStorage.removeItem('lavaca_messages');
      localStorage.removeItem('lavaca_session_start');
      // Keep lavaca_visitor_id for lead tracking
      localStorage.setItem('lavaca_session_start', String(now));
      return; // Don't restore anything — fresh session
    }

    // Session still valid — restore conversation from localStorage
    const savedConvoId = localStorage.getItem('lavaca_convo_id');
    const savedMessages = localStorage.getItem('lavaca_messages');
    if (savedConvoId) setConversationId(savedConvoId);
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        setMessages(parsed);
        setHasGreeted(true);
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Save messages to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('lavaca_messages', JSON.stringify(messages));
    }
    if (conversationId) {
      localStorage.setItem('lavaca_convo_id', conversationId);
    }
  }, [messages, conversationId]);

  // Show greeting when opened for first time
  useEffect(() => {
    if (isOpen && !hasGreeted && messages.length === 0) {
      setHasGreeted(true);
      const greeting: Message = {
        role: 'assistant',
        content: "Hi there! 👋 I'm the La Vaca assistant. Whether you're dreaming about a new kitchen, bathroom, or any home renovation — I'm here to help. What can I do for you today?",
        timestamp: new Date().toISOString(),
      };
      setMessages([greeting]);
    }
  }, [isOpen, hasGreeted, messages.length]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
      setUnreadCount(0);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversationId,
          visitorId,
          pageUrl: window.location.href,
        }),
      });

      const data = await response.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.reply || "Sorry, I couldn't process that. Please try again or call us at (201) 212-4917!",
        timestamp: new Date().toISOString(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (data.conversationId) {
        setConversationId(data.conversationId);
        // Ensure session start is set when conversation begins
        if (!localStorage.getItem('lavaca_session_start')) {
          localStorage.setItem('lavaca_session_start', String(Date.now()));
        }
      }

      if (!isOpen) {
        setUnreadCount(prev => prev + 1);
      }
    } catch {
      const errorMessage: Message = {
        role: 'assistant',
        content: "I'm having trouble connecting right now. You can reach us directly at (201) 212-4917 or email info@lavacagc.com!",
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [inputValue, isLoading, conversationId, visitorId, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Hide chat widget on /free-estimate and across the Home Care portal — the
  // checklist has its own floating "Estimate" action, and a sales chat bubble
  // is off-message for a free, no-fee program.
  if (pathname === '/free-estimate' || pathname.startsWith('/home-care')) {
    return null;
  }



  return (
    <>
      {/* Chat Window */}
      <div
        className={`fixed bottom-20 right-4 z-[9999] hidden md:block transition-all duration-300 ease-out ${
          isOpen
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-4 scale-95 pointer-events-none'
        }`}
        style={{ width: 'min(380px, calc(100vw - 32px))' }}
      >
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden" style={{ height: 'min(520px, calc(100vh - 140px))' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-[#EE9639] to-[#E08530] px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-white font-semibold text-sm">La Vaca Assistant</h3>
              <p className="text-white/80 text-xs">Typically replies in seconds</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white transition-colors cursor-pointer p-1"
              aria-label="Close chat"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3" style={{ minHeight: 0 }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#EE9639] text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {/* Typing indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 px-3 py-2.5 flex-shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                className="flex-1 text-sm border border-gray-200 rounded-full px-4 py-2.5 focus:outline-none focus:border-[#EE9639] focus:ring-1 focus:ring-[#EE9639]/30 transition-colors"
                disabled={isLoading}
                maxLength={1000}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !inputValue.trim()}
                className="w-10 h-10 bg-[#EE9639] hover:bg-[#E08530] disabled:opacity-50 disabled:cursor-not-allowed rounded-full flex items-center justify-center transition-colors cursor-pointer flex-shrink-0"
                aria-label="Send message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
            <p className="text-center text-[10px] text-gray-400 mt-1.5">Powered by La Vaca General Contractors</p>
          </div>
        </div>
      </div>

      {/* Chat Bubble — hidden on mobile (StickyCTA handles mobile actions) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-4 right-4 z-[9999] w-14 h-14 bg-[#EE9639] hover:bg-[#E08530] rounded-full shadow-lg hover:shadow-xl hidden md:flex items-center justify-center transition-all duration-300 cursor-pointer ${
          isOpen ? 'rotate-0' : 'rotate-0'
        }`}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {/* Unread badge */}
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
                {unreadCount}
              </span>
            )}
          </>
        )}
      </button>
    </>
  );
}
