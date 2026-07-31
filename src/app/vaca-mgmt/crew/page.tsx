'use client';

/**
 * /vaca-mgmt/crew - who a visit dispatch can be sent to.
 *
 * Deliberately plain. These are names and email addresses, not user accounts:
 * nobody here signs in to anything, they act on a tokenized link in an email.
 * Anything more (roles, phone numbers, per-person Telegram) can be added when
 * it earns its place.
 *
 * Deactivating rather than deleting is the model. Past dispatches reference
 * these rows, and the record of what was actually sent stores the address as
 * sent, so switching somebody off stops their mail without rewriting history.
 */
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Loader2, UserPlus } from 'lucide-react';

interface CrewMember { id: string; name: string; email: string; active: boolean }

export default function CrewPage() {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/crew');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load the crew');
      setCrew(data.recipients ?? []);
    } catch (e) {
      toast({
        title: 'Could not load the crew',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!name.trim() || !email.trim()) {
      toast({ title: 'Name and email are both required', variant: 'destructive' });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch('/api/admin/crew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.issues?.[0]?.message || 'Could not add them');
      setName('');
      setEmail('');
      await load();
      toast({ title: 'Added', description: `${email.trim()} will get every visit dispatch.` });
    } catch (e) {
      toast({ title: 'Could not add them', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (member: CrewMember) => {
    setToggling(member.id);
    try {
      const res = await fetch('/api/admin/crew', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: member.id, active: !member.active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update them');
      await load();
    } catch (e) {
      toast({ title: 'Could not update them', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setToggling(null);
    }
  };

  const activeCount = crew.filter((c) => c.active).length;

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Crew</h1>
        <p className="mt-1 text-sm text-text-muted">
          Everyone active gets an email when a visit is scheduled, with the calendar invite
          attached and a link to confirm the sub.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add someone</CardTitle>
          <CardDescription>They do not sign in - they act on a link in the email.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div>
            <Label htmlFor="crew-name">Name</Label>
            <Input id="crew-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Veronica" data-testid="crew-name" />
          </div>
          <div>
            <Label htmlFor="crew-email">Email</Label>
            <Input id="crew-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="veronica@lavacagc.com" data-testid="crew-email" />
          </div>
          <div className="flex items-end">
            <Button onClick={add} disabled={adding} data-testid="crew-add">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <><UserPlus className="mr-1.5 h-4 w-4" /> Add</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">On the list</CardTitle>
          <CardDescription>
            {activeCount === 0
              ? 'Nobody is active - scheduling a visit will tell no one.'
              : `${activeCount} active. Everyone active is pre-ticked when you schedule a visit.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : crew.length === 0 ? (
            <p className="text-sm text-text-muted">Nobody yet.</p>
          ) : (
            <div className="space-y-2" data-testid="crew-list">
              {crew.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="font-semibold">{c.name}</span>
                    <span className="block truncate text-xs text-text-muted">{c.email}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    {!c.active && <span className="text-xs font-medium text-text-muted">Off</span>}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => toggle(c)}
                      disabled={toggling === c.id}
                      data-testid={`crew-toggle-${c.id}`}
                    >
                      {toggling === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : c.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
