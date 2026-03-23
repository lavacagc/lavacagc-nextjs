import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Link, 
  AlertTriangle, 
  CheckCircle, 
  RefreshCw, 
  ExternalLink,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface BrokenLink {
  id: string;
  content_type: string;
  content_id: string;
  url: string;
  status_code: number | null;
  error_message: string | null;
  last_checked: string;
  resolved: boolean;
  content_title?: string;
}

const BrokenLinkDetector: React.FC = () => {
  const [brokenLinks, setBrokenLinks] = useState<BrokenLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    loadBrokenLinks();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadBrokenLinks is stable, only needs to run on mount
  }, []);

  const loadBrokenLinks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('broken_links')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Enrich with content titles
      const enrichedLinks = await Promise.all(
        (data || []).map(async (link) => {
          let contentTitle = 'Unknown';
          
          try {
            if (link.content_type === 'blog_post') {
              const { data: post } = await supabase
                .from('blog_posts')
                .select('title')
                .eq('id', link.content_id)
                .single();
              contentTitle = post?.title || contentTitle;
            } else if (link.content_type === 'project') {
              const { data: project } = await supabase
                .from('projects')
                .select('title')
                .eq('id', link.content_id)
                .single();
              contentTitle = project?.title || contentTitle;
            }
          } catch {
            console.error('Error fetching content title:', error);
          }

          return { ...link, content_title: contentTitle };
        })
      );

      setBrokenLinks(enrichedLinks);
    } catch {
      toast({
        title: "Loading Failed",
        description: "Could not load broken links.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const runFullLinkCheck = async () => {
    setChecking(true);
    setProgress(0);
    
    try {
      // Get all published content to check
      const [blogPosts, projects] = await Promise.all([
        supabase.from('blog_posts').select('id, content').eq('published', true),
        supabase.from('projects').select('id, challenge, solution').eq('active', true)
      ]);

      const allContent = [
        ...(blogPosts.data || []).filter(Boolean).map(post => ({ 
          id: post.id, 
          content: post.content || '', 
          type: 'blog_post' as const 
        })),
        ...(projects.data || []).filter(Boolean).map(project => ({ 
          id: project.id, 
          content: `${project.challenge || ''} ${project.solution || ''}`, 
          type: 'project' as const 
        }))
      ];

      let completed = 0;
      
      for (const item of allContent) {
        try {
          await supabase.functions.invoke('link-checker', {
            body: {
              contentType: item.type,
              contentId: item.id,
              content: item.content || ''
            }
          });
        } catch (err) {
          console.error(`Link check failed for ${item.id}:`, err);
        }
        
        completed++;
        setProgress((completed / allContent.length) * 100);
      }

      toast({
        title: "Link Check Complete",
        description: `Checked ${allContent.length} pieces of content for broken links.`
      });

      await loadBrokenLinks();
    } catch {
      toast({
        title: "Check Failed",
        description: "Could not complete link check.",
        variant: "destructive"
      });
    } finally {
      setChecking(false);
      setProgress(0);
    }
  };

  const recheckAllLinks = async () => {
    try {
      const { error } = await supabase.functions.invoke('link-checker', {
        body: { checkAll: true }
      });

      if (error) throw error;

      toast({
        title: "Recheck Complete",
        description: "All broken links have been rechecked."
      });

      await loadBrokenLinks();
    } catch {
      toast({
        title: "Recheck Failed",
        description: "Could not recheck broken links.",
        variant: "destructive"
      });
    }
  };

  const markAsResolved = async (id: string) => {
    try {
      const { error } = await supabase
        .from('broken_links')
        .update({ resolved: true })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Link Marked as Resolved",
        description: "The broken link has been marked as resolved."
      });

      await loadBrokenLinks();
    } catch {
      toast({
        title: "Update Failed",
        description: "Could not update link status.",
        variant: "destructive"
      });
    }
  };

  const getStatusBadge = (link: BrokenLink) => {
    if (link.resolved) {
      return <Badge className="bg-accent-emerald text-white">Resolved</Badge>;
    }
    
    if (link.status_code) {
      const isClientError = link.status_code >= 400 && link.status_code < 500;
      const isServerError = link.status_code >= 500;
      
      if (isClientError) {
        return <Badge variant="destructive">{link.status_code} Client Error</Badge>;
      } else if (isServerError) {
        return <Badge className="bg-accent-sunset text-white">{link.status_code} Server Error</Badge>;
      }
    }
    
    return <Badge variant="secondary">Connection Error</Badge>;
  };

  const unresolvedLinks = brokenLinks.filter(link => !link.resolved);
  const resolvedLinks = brokenLinks.filter(link => link.resolved);

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Link className="h-5 w-5" />
              <span>Broken Link Detector</span>
            </CardTitle>
            
            <div className="flex space-x-2">
              <Button
                onClick={recheckAllLinks}
                variant="outline"
                disabled={checking}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Recheck All
              </Button>
              
              <Button
                onClick={runFullLinkCheck}
                disabled={checking}
                className="bg-gradient-to-r from-primary to-accent-tangerine"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Run Full Check
              </Button>
            </div>
          </div>
          
          {checking && (
            <div className="mt-4">
              <Progress value={progress} />
              <p className="text-sm text-text-secondary mt-2">
                Checking links... {Math.round(progress)}% complete
              </p>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Statistics */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-accent-sunset">{unresolvedLinks.length}</div>
            <div className="text-sm text-text-secondary">Broken Links</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-accent-emerald">{resolvedLinks.length}</div>
            <div className="text-sm text-text-secondary">Resolved</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-text-primary">{brokenLinks.length}</div>
            <div className="text-sm text-text-secondary">Total Checked</div>
          </CardContent>
        </Card>
      </div>

      {/* Broken Links Table */}
      {unresolvedLinks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-accent-sunset">
              Unresolved Broken Links ({unresolvedLinks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Content</TableHead>
                  <TableHead>Broken URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Checked</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {unresolvedLinks.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{link.content_title}</div>
                        <Badge variant="outline" className="text-xs mt-1">
                          {link.content_type.replace('_', ' ')}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-sm max-w-xs truncate" title={link.url}>
                        {link.url}
                      </div>
                      {link.error_message && (
                        <div className="text-xs text-text-secondary mt-1">
                          {link.error_message}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(link)}</TableCell>
                    <TableCell>
                      <div className="flex items-center text-sm text-text-secondary">
                        <Clock className="h-3 w-3 mr-1" />
                        {new Date(link.last_checked).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(link.url, '_blank')}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => markAsResolved(link.id)}
                          className="text-accent-emerald hover:text-accent-emerald"
                        >
                          <CheckCircle className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Success State */}
      {unresolvedLinks.length === 0 && !loading && (
        <Card>
          <CardContent className="text-center py-12">
            <CheckCircle className="h-12 w-12 text-accent-emerald mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              No Broken Links Found
            </h3>
            <p className="text-text-secondary">
              All links are working properly. Run a full check to verify all content.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default BrokenLinkDetector;