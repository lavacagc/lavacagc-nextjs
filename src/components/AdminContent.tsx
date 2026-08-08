'use client'

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { BlogPostEditor } from '@/components/admin/BlogPostEditor';
import { BlogPostList } from '@/components/admin/BlogPostList';
import { ServicesEditor } from '@/components/admin/ServicesEditor';
import { ServiceAreasEditor } from '@/components/admin/ServiceAreasEditor';
import { ProjectUploadSystem } from '@/components/admin/ProjectUploadSystem';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import AdminSidebar from '@/components/admin/AdminSidebar';
import AnalyticsSettings from '@/components/admin/AnalyticsSettings';
import { GMBSettings } from '@/components/admin/GMBSettings';
import { LeadsManager } from '@/components/admin/LeadsManager';
import { EstimatesManager } from '@/components/admin/EstimatesManager';
import dynamic from 'next/dynamic';

// Dynamically import the follow-ups page
const FollowUpsPage = dynamic(() => import('@/app/vaca-mgmt/follow-ups/page'), { ssr: false });
// Send-estimate is also embedded as a tab. The standalone routes at
// /vaca-mgmt/send-estimate{,/log} continue to work for direct links; the
// estimate log itself is reached from the Send Estimate page or the Email Log.
const SendEstimatePage = dynamic(() => import('@/app/vaca-mgmt/send-estimate/page'), { ssr: false });
// Send-service-quote is the one-visit sibling of send-estimate and sits beside
// it, so the owner finds it without knowing the URL.
const SendServiceQuotePage = dynamic(() => import('@/app/vaca-mgmt/send-service-quote/page'), { ssr: false });
const EmailsLogPage = dynamic(() => import('@/app/vaca-mgmt/emails/page'), { ssr: false });
const HomeRecordsPage = dynamic(() => import('@/app/vaca-mgmt/home-records/page'), { ssr: false });
const ProposalsPage = dynamic(() => import('@/app/vaca-mgmt/proposals/page'), { ssr: false });
const HomeCareShopPage = dynamic(() => import('@/app/vaca-mgmt/home-care-shop/page'), { ssr: false });
const CrewPage = dynamic(() => import('@/app/vaca-mgmt/crew/page'), { ssr: false });
const PreferencesAdminPage = dynamic(() => import('@/app/vaca-mgmt/preferences/page'), { ssr: false });
const ReleasesAdminPage = dynamic(() => import('@/app/vaca-mgmt/releases/page'), { ssr: false });
const ConversionDashboard = dynamic(() => import('@/components/admin/ConversionDashboard'), { ssr: false });
const SeoSuggestionsDashboard = dynamic(() => import('@/components/admin/SeoSuggestionsDashboard'), { ssr: false });
const CMSPageEditor = dynamic(() => import('@/components/admin/CMSPageEditor').then(m => ({ default: m.CMSPageEditor })), { ssr: false });
import { PricingManager } from '@/components/admin/PricingManager';
import { BannerManager } from '@/components/admin/BannerManager';
import { ComplianceDocumentsManager } from '@/components/admin/ComplianceDocumentsManager';
import { LogOut, Menu } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function AdminContent() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTabRaw] = useState('dashboard');
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [projectMode, setProjectMode] = useState<'manage' | 'upload' | 'edit'>('manage');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editingProject, setEditingProject] = useState<any>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth');
    }
  }, [user, loading, router]);

  // Reset project mode when switching to projects tab
  const setActiveTab = useCallback((tab: string) => {
    setActiveTabRaw(tab);
    if (tab === 'projects') {
      setProjectMode('manage');
      setEditingProject(null);
    }
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      toast({
        title: "Signed Out",
        description: "You have been signed out successfully.",
      });
      router.push('/auth');
    } catch {
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to auth page
  }

  return (
    <div className="min-h-screen bg-muted/30 flex overflow-x-hidden">
      <AdminSidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isMobileOpen={isMobileSidebarOpen}
        onMobileClose={() => setIsMobileSidebarOpen(false)}
      />

      <div className={`flex-1 ${isMobile ? 'ml-0' : 'ml-16'} overflow-x-hidden max-w-full`}>
        <div className="border-b bg-background sticky top-[var(--smart-banner-height,0px)] transition-[top] duration-300 z-10 max-w-full">
          <div className="container mx-auto px-4 py-4 max-w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 md:gap-4">
                {/* Mobile menu button */}
                {isMobile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsMobileSidebarOpen(true)}
                    aria-label="Open menu"
                  >
                    <Menu className="w-5 h-5" />
                  </Button>
                )}
                <h1 className="text-xl md:text-2xl font-bold">Content Management</h1>
                {!isMobile && (
                  <span className="text-sm text-muted-foreground">
                    {user.email}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!isMobile && (
                  <Button
                    variant="ghost"
                    onClick={() => router.push('/')}
                  >
                    View Website
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size={isMobile ? "icon" : "default"}
                  onClick={handleSignOut}
                >
                  {!isMobile && <span>Sign Out</span>}
                  {isMobile && <LogOut className="w-4 h-4" />}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-2 md:px-4 py-4 md:py-8 pb-20 max-w-7xl overflow-x-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab}>

          <TabsContent value="dashboard">
            <AdminDashboard
              onNavigateToTab={setActiveTab}
              onEditPost={(id) => {
                setEditingPost(id);
                setActiveTab('new-post');
              }}
            />
          </TabsContent>

          <TabsContent value="blog">
            <Card>
              <CardHeader>
                <CardTitle>Manage Blog Posts</CardTitle>
                <CardDescription>
                  View, edit, and manage all your blog posts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BlogPostList
                  onEditPost={(id) => {
                    setEditingPost(id);
                    setActiveTab('new-post');
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pages">
            <CMSPageEditor />
          </TabsContent>

          <TabsContent value="services">
            <Card>
              <CardHeader>
                <CardTitle>Services Management</CardTitle>
                <CardDescription>
                  Manage your service offerings, descriptions, and features
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ServicesEditor />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="service-areas">
            <Card>
              <CardHeader>
                <CardTitle>Service Areas</CardTitle>
                <CardDescription>
                  Manage the locations where you provide services
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ServiceAreasEditor />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="projects">
            <ProjectUploadSystem
              mode={projectMode}
              onModeChange={(mode, project) => {
                setProjectMode(mode);
                if (mode === 'edit' && project) {
                  setEditingProject(project);
                } else if (mode === 'manage' || mode === 'upload') {
                  setEditingProject(null);
                }
              }}
              editProject={editingProject}
            />
          </TabsContent>

          <TabsContent value="banners">
            <BannerManager />
          </TabsContent>

          <TabsContent value="seo">
            <SeoSuggestionsDashboard />
          </TabsContent>

          <TabsContent value="analytics">
            <AnalyticsSettings />
          </TabsContent>

          <TabsContent value="gmb">
            <GMBSettings />
          </TabsContent>

          <TabsContent value="leads">
            <LeadsManager />
          </TabsContent>

          <TabsContent value="follow-ups">
            <FollowUpsPage />
          </TabsContent>

          <TabsContent value="send-estimate">
            <SendEstimatePage />
          </TabsContent>

          <TabsContent value="send-service-quote">
            <SendServiceQuotePage />
          </TabsContent>

          <TabsContent value="emails">
            <EmailsLogPage />
          </TabsContent>

          <TabsContent value="home-records">
            <HomeRecordsPage />
          </TabsContent>

          <TabsContent value="proposals">
            <ProposalsPage />
          </TabsContent>

          <TabsContent value="home-care-shop">
            <HomeCareShopPage />
          </TabsContent>

          <TabsContent value="crew">
            <CrewPage />
          </TabsContent>

          <TabsContent value="preferences">
            <PreferencesAdminPage />
          </TabsContent>

          <TabsContent value="releases">
            <ReleasesAdminPage />
          </TabsContent>

          <TabsContent value="estimates">
            <EstimatesManager />
          </TabsContent>

          <TabsContent value="pricing">
            <PricingManager />
          </TabsContent>

          <TabsContent value="compliance">
            <ComplianceDocumentsManager />
          </TabsContent>

          <TabsContent value="conversions">
            <ConversionDashboard />
          </TabsContent>

          <TabsContent value="new-post">
            <Card>
              <CardHeader>
                <CardTitle>
                  {editingPost ? 'Edit Blog Post' : 'Create New Blog Post'}
                </CardTitle>
                <CardDescription>
                  {editingPost ? 'Update your blog post content' : 'Create a new blog post for your website'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <BlogPostEditor
                  postId={editingPost}
                  onSave={() => {
                    setEditingPost(null);
                    setActiveTab('blog');
                    toast({
                      title: "Success",
                      description: "Blog post saved successfully!"
                    });
                  }}
                  onCancel={() => {
                    setEditingPost(null);
                    setActiveTab('blog');
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
