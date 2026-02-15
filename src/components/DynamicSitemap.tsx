import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  RefreshCw, 
  Download, 
  ExternalLink, 
  Globe, 
  Calendar,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SitemapStats {
  totalUrls: number;
  lastGenerated: string;
  blogPosts: number;
  projects: number;  
  locationPages: number;
  servicePages: number;
}

const DynamicSitemap: React.FC = () => {
  const [stats, setStats] = useState<SitemapStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  // Get the correct sitemap URL - always use the main domain
  const getSitemapUrl = () => {
    return 'https://lavacagc.com/sitemap.xml';
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadSitemapStats(); }, []);

  const loadSitemapStats = async () => {
    setLoading(true);
    try {
      // Get counts from database
      const [blogPosts, projects, serviceAreas] = await Promise.all([
        supabase.from('blog_posts').select('id', { count: 'exact' }).eq('published', true),
        supabase.from('projects').select('id', { count: 'exact' }).eq('active', true),
        supabase.from('service_areas').select('id', { count: 'exact' }).eq('active', true)
      ]);

      const blogCount = blogPosts.count || 0;
      const projectCount = projects.count || 0;
      const locationCount = serviceAreas.count || 0;
      
      // Calculate total URLs
      // Static pages (6) + Service pages (4) + Blog posts + Projects + Locations + Location-Service combinations
      const totalUrls = 6 + 4 + blogCount + projectCount + locationCount + (locationCount * 4);

      setStats({
        totalUrls,
        lastGenerated: new Date().toISOString(),
        blogPosts: blogCount,
        projects: projectCount,
        locationPages: locationCount,
        servicePages: 4
      });

    } catch {
      toast({
        title: "Loading Failed",
        description: "Could not load sitemap statistics.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const generateSitemap = async () => {
    setGenerating(true);
    try {
      const { error: invokeError } = await supabase.functions.invoke('dynamic-sitemap');
      
      if (invokeError) throw invokeError;

      toast({
        title: "Sitemap Generated",
        description: "Dynamic sitemap has been successfully generated."
      });

      await loadSitemapStats();
    } catch {
      toast({
        title: "Generation Failed", 
        description: "Could not generate dynamic sitemap.",
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  const downloadSitemap = async () => {
    try {
      const { data: sitemapData, error: dlError } = await supabase.functions.invoke('dynamic-sitemap');
      
      if (dlError) throw dlError;

      const blob = new Blob([sitemapData], { type: 'application/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sitemap-${new Date().toISOString().split('T')[0]}.xml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download Complete",
        description: "Sitemap XML has been downloaded."
      });
    } catch {
      toast({
        title: "Download Failed",
        description: "Could not download sitemap.",
        variant: "destructive"
      });
    }
  };

  const viewSitemap = () => {
    window.open(getSitemapUrl(), '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Globe className="h-5 w-5" />
              <span>Dynamic XML Sitemap</span>
            </CardTitle>
            
            <div className="flex space-x-2">
              <Button
                onClick={loadSitemapStats}
                variant="outline"
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              
              <Button
                onClick={generateSitemap}
                disabled={generating}
                className="bg-gradient-to-r from-primary to-accent-tangerine"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
                Generate
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Statistics */}
      {stats && (
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-primary">{stats.totalUrls}</div>
              <div className="text-sm text-text-secondary">Total URLs</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-accent-emerald">{stats.blogPosts}</div>
              <div className="text-sm text-text-secondary">Blog Posts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-accent-tangerine">{stats.projects}</div>
              <div className="text-sm text-text-secondary">Projects</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-accent-sunset">{stats.locationPages}</div>
              <div className="text-sm text-text-secondary">Locations</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Sitemap Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={viewSitemap} variant="outline">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Live Sitemap
            </Button>
            
            <Button onClick={downloadSitemap} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download XML
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2 flex items-center">
                <CheckCircle className="h-4 w-4 mr-2 text-accent-emerald" />
                Features
              </h4>
              <ul className="list-disc pl-5 space-y-1 text-text-secondary">
                <li>Automatically includes all published content</li>
                <li>Dynamic URL generation from database</li>
                <li>Proper priority and change frequency settings</li>
                <li>Location-service combination pages</li>
                <li>Real-time updates when content changes</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2 flex items-center">
                <AlertCircle className="h-4 w-4 mr-2 text-accent-sunset" />
                SEO Best Practices
              </h4>
              <ul className="list-disc pl-5 space-y-1 text-text-secondary">
                <li>Submit to Google Search Console</li>
                <li>Update robots.txt with sitemap URL</li>
                <li>Monitor crawl errors regularly</li>
                <li>Regenerate after major content changes</li>
                <li>Keep sitemap under 50,000 URLs</li>
              </ul>
            </div>
          </div>

          <div className="bg-background-secondary p-4 rounded">
            <div className="flex items-center space-x-2 mb-2">
              <Badge variant="outline">Live Endpoint</Badge>
              <Calendar className="h-4 w-4 text-text-secondary" />
              <span className="text-sm text-text-secondary">
                Last generated: {stats ? new Date(stats.lastGenerated).toLocaleString() : 'Never'}
              </span>
            </div>
            <code className="text-sm text-text-secondary">
              {getSitemapUrl()}
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DynamicSitemap;