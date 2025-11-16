import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { 
  Plus, 
  Edit, 
  Trash2, 
  ExternalLink, 
  TrendingUp,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Redirect {
  id: string;
  source_url: string;
  destination_url: string;
  redirect_type: number;
  active: boolean;
  hit_count: number;
  created_at: string;
}

const RedirectManager: React.FC = () => {
  const [redirects, setRedirects] = useState<Redirect[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingRedirect, setEditingRedirect] = useState<Redirect | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newRedirect, setNewRedirect] = useState({
    source_url: '',
    destination_url: '',
    redirect_type: 301,
    active: true
  });
  const { toast } = useToast();

  useEffect(() => {
    loadRedirects();
  }, []);

  const loadRedirects = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('redirects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRedirects(data || []);
    } catch (error) {
      toast({
        title: "Loading Failed",
        description: "Could not load redirects.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const validateUrl = (url: string): boolean => {
    if (url.startsWith('/')) return true; // Relative URL
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleAddRedirect = async () => {
    if (!newRedirect.source_url || !newRedirect.destination_url) {
      toast({
        title: "Validation Error",
        description: "Both source and destination URLs are required.",
        variant: "destructive"
      });
      return;
    }

    if (!validateUrl(newRedirect.source_url) || !validateUrl(newRedirect.destination_url)) {
      toast({
        title: "Invalid URL",
        description: "Please enter valid URLs.",
        variant: "destructive"
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('redirects')
        .insert(newRedirect);

      if (error) throw error;

      toast({
        title: "Redirect Added",
        description: "301 redirect has been created successfully."
      });

      setNewRedirect({
        source_url: '',
        destination_url: '',
        redirect_type: 301,
        active: true
      });
      setShowAddDialog(false);
      await loadRedirects();
    } catch (error) {
      toast({
        title: "Save Failed",
        description: "Could not create redirect. Source URL may already exist.",
        variant: "destructive"
      });
    }
  };

  const handleUpdateRedirect = async (redirect: Redirect) => {
    try {
      const { error } = await supabase
        .from('redirects')
        .update({
          source_url: redirect.source_url,
          destination_url: redirect.destination_url,
          redirect_type: redirect.redirect_type,
          active: redirect.active
        })
        .eq('id', redirect.id);

      if (error) throw error;

      toast({
        title: "Redirect Updated",
        description: "Redirect has been updated successfully."
      });

      await loadRedirects();
      setEditingRedirect(null);
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Could not update redirect.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteRedirect = async (id: string) => {
    if (!confirm('Are you sure you want to delete this redirect?')) return;

    try {
      const { error } = await supabase
        .from('redirects')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Redirect Deleted",
        description: "Redirect has been removed successfully."
      });

      await loadRedirects();
    } catch (error) {
      toast({
        title: "Delete Failed",
        description: "Could not delete redirect.",
        variant: "destructive"
      });
    }
  };

  const getRedirectTypeLabel = (type: number) => {
    switch (type) {
      case 301:
        return <Badge>301 Permanent</Badge>;
      case 302:
        return <Badge variant="secondary">302 Temporary</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getStatusBadge = (active: boolean, hitCount: number) => {
    if (!active) {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    
    if (hitCount > 0) {
      return <Badge className="bg-accent-emerald text-white">Active • {hitCount} hits</Badge>;
    }
    
    return <Badge variant="outline">Active • No hits</Badge>;
  };

  if (loading) {
    return <div className="text-center py-8">Loading redirects...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <ExternalLink className="h-5 w-5" />
              <span>301 Redirect Manager</span>
            </CardTitle>
            
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-primary to-accent-tangerine">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Redirect
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Redirect</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Source URL</label>
                    <Input
                      value={newRedirect.source_url}
                      onChange={(e) => setNewRedirect(prev => ({ ...prev, source_url: e.target.value }))}
                      placeholder="/old-page or https://example.com/old-page"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Destination URL</label>
                    <Input
                      value={newRedirect.destination_url}
                      onChange={(e) => setNewRedirect(prev => ({ ...prev, destination_url: e.target.value }))}
                      placeholder="/new-page or https://ajsconstructionnj.com/new-page"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Redirect Type</label>
                    <Select 
                      value={newRedirect.redirect_type.toString()} 
                      onValueChange={(value) => setNewRedirect(prev => ({ ...prev, redirect_type: parseInt(value) }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="301">301 Permanent</SelectItem>
                        <SelectItem value="302">302 Temporary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={newRedirect.active}
                      onCheckedChange={(checked) => setNewRedirect(prev => ({ ...prev, active: checked }))}
                    />
                    <label className="text-sm">Active</label>
                  </div>
                  <Button 
                    onClick={handleAddRedirect} 
                    className="w-full bg-gradient-to-r from-primary to-accent-tangerine"
                  >
                    Create Redirect
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
      </Card>

      {/* Statistics */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{redirects.length}</div>
            <div className="text-sm text-text-secondary">Total Redirects</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-accent-emerald">
              {redirects.filter(r => r.active).length}
            </div>
            <div className="text-sm text-text-secondary">Active</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-accent-tangerine">
              {redirects.filter(r => r.hit_count > 0).length}
            </div>
            <div className="text-sm text-text-secondary">With Traffic</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-text-primary">
              {redirects.reduce((sum, r) => sum + r.hit_count, 0)}
            </div>
            <div className="text-sm text-text-secondary">Total Hits</div>
          </CardContent>
        </Card>
      </div>

      {/* Redirects Table */}
      <Card>
        <CardHeader>
          <CardTitle>Manage Redirects</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source URL</TableHead>
                <TableHead>Destination URL</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {redirects.map((redirect) => (
                <TableRow key={redirect.id}>
                  <TableCell className="font-mono text-sm">
                    {redirect.source_url}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {redirect.destination_url}
                  </TableCell>
                  <TableCell>
                    {getRedirectTypeLabel(redirect.redirect_type)}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(redirect.active, redirect.hit_count)}
                  </TableCell>
                  <TableCell>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingRedirect(redirect)}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteRedirect(redirect.id)}
                        className="text-accent-sunset hover:text-accent-sunset"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default RedirectManager;