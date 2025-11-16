import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  Search,
  Link,
  Image,
  FileText,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  RefreshCw,
  Loader2
} from 'lucide-react';
import SEOEditor from './SEOEditor';
import BulkSEOEditor from './BulkSEOEditor';
import RedirectManager from './RedirectManager';
import BrokenLinkDetector from './BrokenLinkDetector';
import DynamicSitemap from '../DynamicSitemap';
import HorizontalNav from '@/components/HorizontalNav';
import { useSEOStats } from '@/hooks/useSEOStats';

const SEODashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const { stats, refresh } = useSEOStats();

  // Format relative time for last check
  const formatRelativeTime = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
  };

  // Format number with commas
  const formatNumber = (num: number) => num.toLocaleString();

  // Get badge color based on score
  const getScoreBadgeClass = (score: number) => {
    if (score >= 80) return 'bg-accent-emerald text-white';
    if (score >= 60) return 'bg-accent-tangerine text-white';
    return 'bg-destructive text-white';
  };

  const seoNavItems = [
    { id: 'overview', icon: BarChart3, label: 'Overview', width: '80px' },
    { id: 'bulk', icon: FileText, label: 'Bulk Editor', width: '90px' },
    { id: 'redirects', icon: ExternalLink, label: 'Redirects', width: '80px' },
    { id: 'links', icon: Link, label: 'Links', width: '55px' },
    { id: 'sitemap', icon: Search, label: 'Sitemap', width: '75px' },
    { id: 'images', icon: Image, label: 'Images', width: '70px' },
  ];

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between max-w-full">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">SEO Management</h1>
          <p className="text-text-secondary">
            Optimize your content for search engines with our comprehensive SEO tools.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
          disabled={stats.loading}
          className="flex items-center gap-2"
        >
          {stats.loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh Stats
        </Button>
      </div>

      {/* Error Alert */}
      {stats.error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Error loading SEO stats:</span>
          </div>
          <p className="mt-1 text-sm">{stats.error}</p>
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 max-w-full overflow-x-hidden">
        <HorizontalNav 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          items={seoNavItems}
        />

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center space-x-2">
                  <Search className="h-5 w-5 text-primary" />
                  <span>SEO Health</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Average Score</span>
                    {stats.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Badge className={getScoreBadgeClass(stats.averageScore)}>
                        {stats.averageScore}/100
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Pages Optimized</span>
                    {stats.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="text-sm font-semibold">
                        {stats.pagesOptimized}/{stats.totalPages}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Missing Meta Descriptions</span>
                    {stats.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : stats.missingMetaDescriptions > 0 ? (
                      <Badge variant="destructive">{stats.missingMetaDescriptions}</Badge>
                    ) : (
                      <Badge className="bg-accent-emerald text-white">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        0
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center space-x-2">
                  <Link className="h-5 w-5 text-primary" />
                  <span>Link Health</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Broken Links</span>
                    {stats.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : stats.brokenLinksCount > 0 ? (
                      <Badge variant="destructive">{stats.brokenLinksCount}</Badge>
                    ) : (
                      <Badge className="bg-accent-emerald text-white">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        0
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Total Links Checked</span>
                    {stats.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="text-sm font-semibold">
                        {formatNumber(stats.totalLinksChecked)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Last Check</span>
                    {stats.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="text-sm text-text-secondary">
                        {formatRelativeTime(stats.lastLinkCheck)}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center space-x-2">
                  <ExternalLink className="h-5 w-5 text-primary" />
                  <span>Redirects</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Active Redirects</span>
                    {stats.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="text-sm font-semibold">{stats.activeRedirects}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">Total Redirects</span>
                    {stats.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <span className="text-sm font-semibold">{stats.totalRedirects}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">This Month's Hits</span>
                    {stats.loading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Badge className="bg-accent-tangerine text-white">
                        {formatNumber(stats.monthlyHits)}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="text-center p-4 border rounded-lg hover:bg-muted/30 cursor-pointer"
                     onClick={() => setActiveTab('bulk')}>
                  <FileText className="h-8 w-8 text-primary mx-auto mb-2" />
                  <h3 className="font-medium mb-1">Bulk Edit</h3>
                  <p className="text-xs text-text-secondary">Update multiple pages at once</p>
                </div>
                
                <div className="text-center p-4 border rounded-lg hover:bg-muted/30 cursor-pointer"
                     onClick={() => setActiveTab('links')}>
                  <AlertTriangle className="h-8 w-8 text-accent-sunset mx-auto mb-2" />
                  <h3 className="font-medium mb-1">Fix Broken Links</h3>
                  <p className="text-xs text-text-secondary">Find and repair broken links</p>
                </div>
                
                <div className="text-center p-4 border rounded-lg hover:bg-muted/30 cursor-pointer"
                     onClick={() => setActiveTab('redirects')}>
                  <ExternalLink className="h-8 w-8 text-accent-teal mx-auto mb-2" />
                  <h3 className="font-medium mb-1">Manage Redirects</h3>
                  <p className="text-xs text-text-secondary">Set up 301 redirects</p>
                </div>
                
                <div className="text-center p-4 border rounded-lg hover:bg-muted/30 cursor-pointer"
                     onClick={() => setActiveTab('sitemap')}>
                  <Search className="h-8 w-8 text-accent-emerald mx-auto mb-2" />
                  <h3 className="font-medium mb-1">Generate Sitemap</h3>
                  <p className="text-xs text-text-secondary">Create and manage XML sitemap</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sitemap">
          <DynamicSitemap />
        </TabsContent>

        {/* Bulk Editor Tab */}
        <TabsContent value="bulk">
          <BulkSEOEditor />
        </TabsContent>

        {/* Redirects Tab */}
        <TabsContent value="redirects">
          <RedirectManager />
        </TabsContent>

        {/* Broken Links Tab */}
        <TabsContent value="links">
          <BrokenLinkDetector />
        </TabsContent>

        {/* Images Tab */}
        <TabsContent value="images">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Image className="h-5 w-5" />
                <span>Image Optimization</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Image className="h-12 w-12 text-muted mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-text-primary mb-2">
                  Image Optimization Coming Soon
                </h3>
                <p className="text-text-secondary">
                  Automatic image compression and alt text management will be available in the next update.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SEODashboard;