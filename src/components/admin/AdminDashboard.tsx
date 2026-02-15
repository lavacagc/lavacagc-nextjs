import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  Settings, 
  Users, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Building,
  Mail,
  Calendar,
  Eye,
  Phone,
  MapPin,
  DollarSign
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

interface DashboardStats {
  totalBlogs: number;
  totalProjects: number;
  totalLeads: number;
  estimateLeadsToday: number;
  estimateLeadsWeek: number;
  assessmentsPending: number;
  homeAdditionsManual: number;
  draftPosts: number;
  incompleteProjects: number;
  seoIssues: number;
}

interface RecentSubmission {
  id: string;
  type: 'lead' | 'warranty';
  name: string;
  email: string;
  message: string;
  created_at: string;
  phone?: string;
  inquiry_type?: string;
  project_type?: string;
  budget_range?: string;
  city?: string;
  address?: string;
  urgency_level?: string;
  original_project_type?: string;
}

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  created_at: string;
  updated_at: string;
}

interface Project {
  id: string;
  title: string;
  challenge: string;
  solution: string;
  location: string;
  featured_image_id: string | null;
}

export function AdminDashboard({ onNavigateToTab }: { onNavigateToTab: (tab: string) => void }) {
  const router = useRouter();
  const [selectedSubmission, setSelectedSubmission] = useState<RecentSubmission | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const [fullSubmissionData, setFullSubmissionData] = useState<any>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalBlogs: 0,
    totalProjects: 0,
    totalLeads: 0,
    estimateLeadsToday: 0,
    estimateLeadsWeek: 0,
    assessmentsPending: 0,
    homeAdditionsManual: 0,
    draftPosts: 0,
    incompleteProjects: 0,
    seoIssues: 0
  });
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([]);
  const [draftPosts, setDraftPosts] = useState<BlogPost[]>([]);
  const [incompleteProjects, setIncompleteProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      // Load stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const [blogsData, projectsData, leadsData, , seoData, estimateLeadsData] = await Promise.all([
        supabase.from('blog_posts').select('id, published'),
        supabase.from('projects').select('id, title, challenge, solution, location, featured_image_id'),
        supabase.from('leads').select('id'),
        supabase.from('warranty_claims').select('id'),
        supabase.from('seo_analysis').select('id, score').lt('score', 70),
        supabase.from('estimate_leads').select('*')
      ]);

      // Calculate stats
      const totalBlogs = blogsData.data?.length || 0;
      const draftPosts = blogsData.data?.filter(post => !post.published).length || 0;
      const totalProjects = projectsData.data?.length || 0;
      const incompleteProjects = projectsData.data?.filter(
        project => !project.featured_image_id || (project.challenge && project.challenge.length < 100)
      ).length || 0;

      const estimateLeadsToday = estimateLeadsData.data?.filter(lead => 
        new Date(lead.created_at) >= today
      ).length || 0;
      
      const estimateLeadsWeek = estimateLeadsData.data?.filter(lead => 
        new Date(lead.created_at) >= weekAgo
      ).length || 0;

      const assessmentsPending = estimateLeadsData.data?.filter(lead => 
        lead.assessment_requested && lead.lead_status === 'new'
      ).length || 0;

      const homeAdditionsManual = estimateLeadsData.data?.filter(lead => 
        lead.requires_manual_estimate && lead.lead_status === 'new'
      ).length || 0;

      setStats({
        totalBlogs,
        totalProjects,
        totalLeads: leadsData.data?.length || 0,
        estimateLeadsToday,
        estimateLeadsWeek,
        assessmentsPending,
        homeAdditionsManual,
        draftPosts,
        incompleteProjects,
        seoIssues: seoData.data?.length || 0
      });

      // Load recent submissions (only active leads)
      const [recentLeads, recentWarranty] = await Promise.all([
        supabase
          .from('leads')
          .select('*')
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('warranty_claims')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(2)
      ]);

      const submissions: RecentSubmission[] = [
        ...(recentLeads.data?.map(lead => ({
          id: lead.id,
          type: 'lead' as const,
          name: `${lead.first_name} ${lead.last_name}`,
          email: lead.email,
          phone: lead.phone,
          message: lead.message || 'No message provided',
          created_at: lead.created_at,
          inquiry_type: lead.inquiry_type,
          project_type: lead.project_type,
          budget_range: lead.budget_range,
          city: lead.city,
          address: lead.address
        })) || []),
        ...(recentWarranty.data?.map(claim => ({
          id: claim.id,
          type: 'warranty' as const,
          name: `${claim.first_name} ${claim.last_name}`,
          email: claim.email,
          phone: claim.phone,
          message: claim.issue_description,
          created_at: claim.created_at,
          urgency_level: claim.urgency_level,
          original_project_type: claim.original_project_type,
          address: claim.address,
          city: claim.city
        })) || [])
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

      setRecentSubmissions(submissions);

      // Load draft posts
      const draftPostsData = await supabase
        .from('blog_posts')
        .select('id, title, slug, published, created_at, updated_at')
        .eq('published', false)
        .order('updated_at', { ascending: false })
        .limit(5);

      setDraftPosts(draftPostsData.data || []);

      // Load incomplete projects
      const incompleteProjectsData = projectsData.data?.filter(
        project => !project.featured_image_id || (project.challenge && project.challenge.length < 100)
      ).slice(0, 5) || [];

      setIncompleteProjects(incompleteProjectsData);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmissionClick = async (submission: RecentSubmission) => {
    setSelectedSubmission(submission);
    
    // Fetch full data for the submission
    try {
      if (submission.type === 'lead') {
        const { data } = await supabase
          .from('leads')
          .select('*')
          .eq('id', submission.id)
          .single();
        setFullSubmissionData(data);
      } else {
        const { data } = await supabase
          .from('warranty_claims')
          .select('*')
          .eq('id', submission.id)
          .single();
        setFullSubmissionData(data);
      }
    } catch (error) {
      console.error('Error fetching submission details:', error);
      toast({
        title: "Error",
        description: "Failed to load submission details",
        variant: "destructive"
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Quick Action Buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button 
              onClick={() => onNavigateToTab('projects')}
              className="h-auto p-4 flex-col gap-2"
              variant="outline"
            >
              <Building className="w-6 h-6" />
              <span>Add Project</span>
            </Button>
            <Button 
              onClick={() => onNavigateToTab('new-post')}
              className="h-auto p-4 flex-col gap-2"
              variant="outline"
            >
              <FileText className="w-6 h-6" />
              <span>Write Blog Post</span>
            </Button>
            <Button 
              onClick={() => onNavigateToTab('estimates')}
              className="h-auto p-4 flex-col gap-2"
              variant="outline"
            >
              <DollarSign className="w-6 h-6" />
              <span>View Estimates</span>
            </Button>
            <Button 
              onClick={() => onNavigateToTab('pricing')}
              className="h-auto p-4 flex-col gap-2"
              variant="outline"
            >
              <Settings className="w-6 h-6" />
              <span>Manage Pricing</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.totalBlogs}</p>
                <p className="text-sm text-muted-foreground">Total Blogs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Building className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.totalProjects}</p>
                <p className="text-sm text-muted-foreground">Total Projects</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{stats.totalLeads}</p>
                <p className="text-sm text-muted-foreground">Total Leads</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{stats.seoIssues}</p>
                <p className="text-sm text-muted-foreground">SEO Issues</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Calculator Estimates Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Calculator Estimates Overview
          </CardTitle>
          <CardDescription>
            Track and manage estimate requests from project calculators
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={() => onNavigateToTab('estimates')}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">New Leads Today</p>
                    <p className="text-3xl font-bold mt-2">{stats.estimateLeadsToday}</p>
                  </div>
                  <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                    <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <Button 
                  variant="link" 
                  className="px-0 mt-2 h-auto text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToTab('estimates');
                  }}
                >
                  View All →
                </Button>
              </CardContent>
            </Card>

            <Card className="cursor-pointer hover:bg-accent transition-colors" onClick={() => onNavigateToTab('estimates')}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">New Leads This Week</p>
                    <p className="text-3xl font-bold mt-2">{stats.estimateLeadsWeek}</p>
                  </div>
                  <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                    <TrendingUp className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <Button 
                  variant="link" 
                  className="px-0 mt-2 h-auto text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToTab('estimates');
                  }}
                >
                  View All →
                </Button>
              </CardContent>
            </Card>

            <Card className={`cursor-pointer hover:bg-accent transition-colors ${stats.assessmentsPending > 0 ? 'border-orange-500' : ''}`} onClick={() => onNavigateToTab('estimates')}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Assessment Requests</p>
                    <p className="text-3xl font-bold mt-2">{stats.assessmentsPending}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${stats.assessmentsPending > 0 ? 'bg-orange-100 dark:bg-orange-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    <CheckCircle className={`w-5 h-5 ${stats.assessmentsPending > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-400'}`} />
                  </div>
                </div>
                {stats.assessmentsPending > 0 && (
                  <Badge variant="destructive" className="mt-2">
                    Action Required
                  </Badge>
                )}
                <Button 
                  variant="link" 
                  className="px-0 mt-2 h-auto text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToTab('estimates');
                  }}
                >
                  View All →
                </Button>
              </CardContent>
            </Card>

            <Card className={`cursor-pointer hover:bg-accent transition-colors ${stats.homeAdditionsManual > 0 ? 'border-red-500' : ''}`} onClick={() => onNavigateToTab('estimates')}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Manual Estimates</p>
                    <p className="text-3xl font-bold mt-2">{stats.homeAdditionsManual}</p>
                  </div>
                  <div className={`p-2 rounded-lg ${stats.homeAdditionsManual > 0 ? 'bg-red-100 dark:bg-red-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                    <Building className={`w-5 h-5 ${stats.homeAdditionsManual > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`} />
                  </div>
                </div>
                {stats.homeAdditionsManual > 0 && (
                  <Badge variant="destructive" className="mt-2">
                    Action Required
                  </Badge>
                )}
                <Button 
                  variant="link" 
                  className="px-0 mt-2 h-auto text-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToTab('estimates');
                  }}
                >
                  View All →
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent Form Submissions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Recent Submissions
            </CardTitle>
            <CardDescription>Latest form submissions from your website</CardDescription>
          </CardHeader>
          <CardContent>
            {recentSubmissions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No recent submissions</p>
            ) : (
              <div className="space-y-2">
                {recentSubmissions.map((submission) => (
                  <div 
                    key={submission.id} 
                    className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSubmissionClick(submission)}
                  >
                    <Badge variant={submission.type === 'lead' ? 'default' : 'secondary'} className="text-xs">
                      {submission.type}
                    </Badge>
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{submission.name}</p>
                      <span className="text-muted-foreground">•</span>
                      <p className="text-xs text-muted-foreground truncate flex-1">{submission.email}</p>
                      <p className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(submission.created_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Eye className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Content Calendar / Drafts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Draft Posts Needing Attention
            </CardTitle>
            <CardDescription>Blog posts that need completion</CardDescription>
          </CardHeader>
          <CardContent>
            {draftPosts.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No draft posts</p>
            ) : (
              <div className="space-y-3">
                {draftPosts.map((post) => (
                  <div key={post.id} className="flex items-start gap-3 p-3 border rounded-lg">
                    <Clock className="w-4 h-4 text-orange-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{post.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Last updated {formatDistanceToNow(new Date(post.updated_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => router.push(`/blog/${post.slug}`)}
                      title="View draft post"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Projects Needing Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="w-5 h-5" />
            Portfolio Projects Needing Details
          </CardTitle>
          <CardDescription>Projects missing images or adequate descriptions</CardDescription>
        </CardHeader>
        <CardContent>
          {incompleteProjects.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-muted-foreground">All projects are complete!</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {incompleteProjects.map((project) => (
                <div key={project.id} className="p-4 border rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{project.title}</p>
                      <p className="text-xs text-muted-foreground">{project.location}</p>
                      <div className="mt-2 space-y-1">
                        {!project.featured_image_id && (
                          <Badge variant="destructive" className="text-xs">Missing Image</Badge>
                        )}
                        {(!project.challenge || project.challenge.length < 100) && (
                          <Badge variant="destructive" className="text-xs">Short Description</Badge>
                        )}
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={() => onNavigateToTab('projects')}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SEO Health Indicators */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              SEO Health Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Badge variant={stats.draftPosts > 0 ? "destructive" : "default"}>
                    {stats.draftPosts}
                  </Badge>
                  <span className="text-sm">Unpublished blog posts</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Badge variant={stats.seoIssues > 0 ? "destructive" : "default"}>
                    {stats.seoIssues}
                  </Badge>
                  <span className="text-sm">Pages with SEO issues</span>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-2">
                  <Badge variant={stats.incompleteProjects > 0 ? "destructive" : "default"}>
                    {stats.incompleteProjects}
                  </Badge>
                  <span className="text-sm">Incomplete portfolio projects</span>
                </div>
              </div>
            </div>
            <Button 
              className="w-full mt-4" 
              variant="outline"
              onClick={() => onNavigateToTab('sitemap')}
            >
              View SEO Dashboard
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Quick Performance Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Published Content</span>
                <span className="font-medium">{stats.totalBlogs - stats.draftPosts} posts</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Complete Projects</span>
                <span className="font-medium">{stats.totalProjects - stats.incompleteProjects} projects</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Content Health</span>
                <Badge variant={stats.seoIssues === 0 ? "default" : "destructive"}>
                  {stats.seoIssues === 0 ? "Good" : "Needs Attention"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submission Details Modal */}
      <Dialog open={!!selectedSubmission} onOpenChange={() => setSelectedSubmission(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant={selectedSubmission?.type === 'lead' ? 'default' : 'secondary'}>
                {selectedSubmission?.type}
              </Badge>
              {selectedSubmission?.name} - Details
            </DialogTitle>
          </DialogHeader>
          
          {fullSubmissionData && selectedSubmission && (
            <div className="space-y-6">
              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">{fullSubmissionData.email}</span>
                  </div>
                  {fullSubmissionData.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{fullSubmissionData.phone}</span>
                    </div>
                  )}
                  {fullSubmissionData.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{fullSubmissionData.address}</span>
                    </div>
                  )}
                  {fullSubmissionData.city && (
                    <div className="flex items-center gap-2">
                      <Building className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{fullSubmissionData.city}, {fullSubmissionData.zip_code}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Project/Issue Details */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">
                  {selectedSubmission.type === 'lead' ? 'Project Details' : 'Issue Details'}
                </h3>
                
                {selectedSubmission.type === 'lead' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fullSubmissionData.inquiry_type && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Inquiry Type</label>
                        <p className="text-sm">{fullSubmissionData.inquiry_type}</p>
                      </div>
                    )}
                    {fullSubmissionData.project_type && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Project Type</label>
                        <p className="text-sm">{fullSubmissionData.project_type}</p>
                      </div>
                    )}
                    {fullSubmissionData.budget_range && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Budget Range</label>
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{fullSubmissionData.budget_range}</span>
                        </div>
                      </div>
                    )}
                    {fullSubmissionData.project_timeline && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Timeline</label>
                        <p className="text-sm">{fullSubmissionData.project_timeline}</p>
                      </div>
                    )}
                    {fullSubmissionData.square_footage && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Square Footage</label>
                        <p className="text-sm">{fullSubmissionData.square_footage} sq ft</p>
                      </div>
                    )}
                    {fullSubmissionData.preferred_contact_method && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Preferred Contact</label>
                        <p className="text-sm">{fullSubmissionData.preferred_contact_method}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {fullSubmissionData.original_project_type && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Original Project</label>
                        <p className="text-sm">{fullSubmissionData.original_project_type}</p>
                      </div>
                    )}
                    {fullSubmissionData.urgency_level && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Urgency Level</label>
                        <Badge variant={fullSubmissionData.urgency_level === 'High' ? 'destructive' : 'default'}>
                          {fullSubmissionData.urgency_level}
                        </Badge>
                      </div>
                    )}
                    {fullSubmissionData.invoice_number && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Invoice Number</label>
                        <p className="text-sm">{fullSubmissionData.invoice_number}</p>
                      </div>
                    )}
                    {fullSubmissionData.project_completion_date && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Project Completion</label>
                        <p className="text-sm">{new Date(fullSubmissionData.project_completion_date).toLocaleDateString()}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Message */}
              <div className="space-y-2">
                <h3 className="font-semibold text-lg border-b pb-2">
                  {selectedSubmission.type === 'lead' ? 'Message' : 'Issue Description'}
                </h3>
                <div className="bg-muted/50 p-4 rounded-lg">
                  <p className="text-sm whitespace-pre-wrap">
                    {selectedSubmission.type === 'lead' ? fullSubmissionData.message : fullSubmissionData.issue_description}
                  </p>
                </div>
              </div>

              {/* Metadata */}
              <div className="space-y-2">
                <h3 className="font-semibold text-lg border-b pb-2">Submission Info</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Submitted</label>
                    <p>{new Date(fullSubmissionData.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">ID</label>
                    <p className="font-mono text-xs">{fullSubmissionData.id}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}