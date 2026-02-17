'use client';

import { useState, useEffect, useCallback } from 'react';

interface ChatConversation {
  id: string;
  visitor_id: string;
  messages: Array<{ role: string; content: string; timestamp: string }>;
  lead_captured: boolean;
  lead_data: Record<string, string> | null;
  created_at: string;
  updated_at: string;
  page_url: string | null;
}

interface FollowUpItem {
  id: string;
  lead_email: string;
  lead_name: string;
  follow_up_type: string;
  scheduled_at: string;
  sent_at: string | null;
  status: string;
  email_subject: string;
  email_body: string;
  created_at: string;
}

interface Lead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  inquiry_type: string;
  project_type: string | null;
  city: string | null;
  created_at: string;
  message: string | null;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function supabaseGet<T>(table: string, params = ''): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) return [];
  return res.json();
}

export default function AutomationTestPage() {
  const [activeTab, setActiveTab] = useState<'conversations' | 'leads' | 'followups' | 'test'>('test');
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [testOutput, setTestOutput] = useState<string[]>([]);
  const [chatTestInput, setChatTestInput] = useState('');
  const [chatTestConvoId, setChatTestConvoId] = useState<string | null>(null);
  const [chatTestMessages, setChatTestMessages] = useState<Array<{ role: string; content: string }>>([]);

  const log = useCallback((msg: string) => {
    setTestOutput(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [convos, fups, lds] = await Promise.all([
        supabaseGet<ChatConversation>('chat_conversations', 'select=*&order=created_at.desc&limit=20'),
        supabaseGet<FollowUpItem>('follow_up_queue', 'select=*&order=created_at.desc&limit=50'),
        fetch('/api/leads/list').then(r => r.ok ? r.json() : []).catch(() => []) as Promise<Lead[]>,
      ]);
      setConversations(convos);
      setFollowUps(fups);
      setLeads(lds);
    } catch (err) {
      console.error('Fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetchData is an async data loader that sets state on completion, standard pattern for data fetching
    fetchData();
  }, [fetchData]);

  const simulateNewLead = async () => {
    log('Simulating new lead...');
    try {
      const response = await fetch('/api/leads/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test User',
          email: `test-${Date.now()}@example.com`,
          source: 'test-dashboard',
          projectType: 'kitchen',
        }),
      });
      const data = await response.json();
      log(`Lead webhook response: ${JSON.stringify(data)}`);
      await fetchData();
    } catch (err) {
      log(`Error: ${err}`);
    }
  };

  const triggerFollowUps = async () => {
    log('Triggering follow-up processing...');
    try {
      const response = await fetch('/api/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process-all' }),
      });
      const data = await response.json();
      log(`Follow-up response: ${JSON.stringify(data)}`);
      await fetchData();
    } catch (err) {
      log(`Error: ${err}`);
    }
  };

  const testChatbot = async () => {
    if (!chatTestInput.trim()) return;

    const userMsg = chatTestInput.trim();
    setChatTestMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatTestInput('');
    log(`Sending to chatbot: "${userMsg}"`);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg,
          conversationId: chatTestConvoId,
          visitorId: 'test-dashboard-' + Date.now(),
          pageUrl: '/admin/automation-test',
        }),
      });
      const data = await response.json();
      setChatTestMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      if (data.conversationId) setChatTestConvoId(data.conversationId);
      log(`Chatbot reply: "${data.reply.substring(0, 80)}..." | Lead captured: ${data.leadCaptured}`);
      await fetchData();
    } catch (err) {
      log(`Chatbot error: ${err}`);
      setChatTestMessages(prev => [...prev, { role: 'assistant', content: 'Error connecting to chatbot API' }]);
    }
  };

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      sent: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      cancelled: 'bg-gray-100 text-gray-600',
      responded: 'bg-blue-100 text-blue-800',
    };
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-600'}`}>
        {status}
      </span>
    );
  };

  const tabs = [
    { id: 'test' as const, label: '🧪 Test Controls' },
    { id: 'conversations' as const, label: '💬 Conversations' },
    { id: 'leads' as const, label: '👥 Leads' },
    { id: 'followups' as const, label: '📧 Follow-ups' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🔨 Automation Test Dashboard</h1>
          <p className="text-gray-500 mt-1">La Vaca AI Chatbot + Lead Follow-Up System</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-sm text-gray-500">Conversations</p>
            <p className="text-2xl font-bold text-gray-900">{conversations.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-sm text-gray-500">Leads Captured</p>
            <p className="text-2xl font-bold text-[#EE9639]">{conversations.filter(c => c.lead_captured).length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-sm text-gray-500">Total Leads</p>
            <p className="text-2xl font-bold text-gray-900">{leads.length}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border">
            <p className="text-sm text-gray-500">Pending Follow-ups</p>
            <p className="text-2xl font-bold text-yellow-600">{followUps.filter(f => f.status === 'pending').length}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-lg p-1 shadow-sm border w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-[#EE9639] text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-3 py-2 rounded-md text-sm text-gray-500 hover:bg-gray-100 cursor-pointer disabled:opacity-50"
          >
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>

        {/* Test Controls Tab */}
        {activeTab === 'test' && (
          <div className="space-y-6">
            {/* Action Buttons */}
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={simulateNewLead}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors"
                >
                  ➕ Simulate New Lead
                </button>
                <button
                  onClick={triggerFollowUps}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors"
                >
                  📧 Trigger Follow-ups
                </button>
                <button
                  onClick={() => {
                    setChatTestMessages([]);
                    setChatTestConvoId(null);
                    log('Chat test reset');
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium cursor-pointer transition-colors"
                >
                  🗑️ Reset Chat Test
                </button>
              </div>
            </div>

            {/* Chatbot Test */}
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold mb-4">🤖 Test Chatbot</h2>
              <div className="bg-gray-50 rounded-lg p-4 mb-4 max-h-80 overflow-y-auto space-y-3">
                {chatTestMessages.length === 0 && (
                  <p className="text-gray-400 text-sm text-center py-4">Send a message to test the chatbot...</p>
                )}
                {chatTestMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-[#EE9639] text-white'
                        : 'bg-white border text-gray-800'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatTestInput}
                  onChange={(e) => setChatTestInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && testChatbot()}
                  placeholder="Type a test message..."
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#EE9639]/30 focus:border-[#EE9639]"
                />
                <button
                  onClick={testChatbot}
                  className="px-4 py-2 bg-[#EE9639] hover:bg-[#E08530] text-white rounded-lg text-sm font-medium cursor-pointer transition-colors"
                >
                  Send
                </button>
              </div>
              <div className="mt-3 text-xs text-gray-400">
                <p>Try: &quot;What services do you offer?&quot; | &quot;How much does a kitchen remodel cost?&quot; | &quot;My email is test@example.com&quot;</p>
              </div>
            </div>

            {/* Log Output */}
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <h2 className="text-lg font-semibold mb-4">📋 Activity Log</h2>
              <div className="bg-gray-900 rounded-lg p-4 max-h-60 overflow-y-auto font-mono text-xs">
                {testOutput.length === 0 && (
                  <p className="text-gray-500">No activity yet...</p>
                )}
                {testOutput.map((line, i) => (
                  <p key={i} className="text-green-400 mb-1">{line}</p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Conversations Tab */}
        {activeTab === 'conversations' && (
          <div className="space-y-4">
            {conversations.length === 0 ? (
              <div className="bg-white rounded-xl p-8 shadow-sm border text-center">
                <p className="text-gray-400">No conversations yet. Start chatting with the widget!</p>
              </div>
            ) : (
              conversations.map(convo => (
                <div key={convo.id} className="bg-white rounded-xl p-6 shadow-sm border">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm font-mono text-gray-400">{convo.id.substring(0, 8)}...</span>
                    <span className="text-xs text-gray-400">{new Date(convo.created_at).toLocaleString()}</span>
                    {convo.lead_captured && (
                      <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full font-medium">Lead Captured</span>
                    )}
                    {convo.page_url && (
                      <span className="text-xs text-gray-400 truncate max-w-40">{convo.page_url}</span>
                    )}
                  </div>
                  {convo.lead_data && (
                    <div className="mb-3 bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-800">
                      Lead: {JSON.stringify(convo.lead_data)}
                    </div>
                  )}
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {(convo.messages || []).map((msg, i) => (
                      <div key={i} className={`text-sm ${msg.role === 'user' ? 'text-gray-800' : 'text-gray-600'}`}>
                        <span className={`font-medium ${msg.role === 'user' ? 'text-[#EE9639]' : 'text-blue-600'}`}>
                          {msg.role === 'user' ? 'User' : 'Bot'}:
                        </span>{' '}
                        {msg.content}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Leads Tab */}
        {activeTab === 'leads' && (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Phone</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">City</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Follow-ups</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No leads yet</td>
                    </tr>
                  ) : (
                    leads.map(lead => {
                      const leadFollowUps = followUps.filter(f => f.lead_email === lead.email);
                      return (
                        <tr key={lead.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{lead.first_name} {lead.last_name}</td>
                          <td className="px-4 py-3 text-gray-600">{lead.email}</td>
                          <td className="px-4 py-3 text-gray-600">{lead.phone}</td>
                          <td className="px-4 py-3">{lead.inquiry_type}</td>
                          <td className="px-4 py-3 text-gray-600">{lead.city || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{new Date(lead.created_at).toLocaleDateString()}</td>
                          <td className="px-4 py-3">
                            {leadFollowUps.length > 0 ? (
                              <div className="flex gap-1 flex-wrap">
                                {leadFollowUps.map(f => (
                                  <span key={f.id} title={f.follow_up_type}>
                                    {statusBadge(f.status)}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-gray-400 text-xs">None</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Follow-ups Tab */}
        {activeTab === 'followups' && (
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Subject</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Scheduled</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Sent</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {followUps.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No follow-ups yet</td>
                    </tr>
                  ) : (
                    followUps.map(fu => (
                      <tr key={fu.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{fu.lead_name}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{fu.lead_email}</td>
                        <td className="px-4 py-3">
                          <span className="bg-purple-100 text-purple-800 text-xs px-2 py-0.5 rounded-full font-medium">
                            {fu.follow_up_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-48 truncate">{fu.email_subject}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{new Date(fu.scheduled_at).toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{fu.sent_at ? new Date(fu.sent_at).toLocaleString() : '—'}</td>
                        <td className="px-4 py-3">{statusBadge(fu.status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
