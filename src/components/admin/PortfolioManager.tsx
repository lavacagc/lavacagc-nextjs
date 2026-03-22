import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AdminCheckbox } from '@/components/admin/ui/AdminCheckbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Grid, 
  List, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Star, 
  Copy, 
  Archive,
  Eye,
  MoreHorizontal,
  Calendar,
  MapPin,
  DollarSign,
  GripVertical,
  ArrowUpDown,
  Save,
  X
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import Image from 'next/image';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

interface Project {
  id: string;
  title: string;
  location: string;
  service_types: string[];
  date_completed: string;
  budget_range: string;
  featured: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  client_first_name: string;
  testimonial_rating: number;
  featured_image_id?: string;
  project_images?: Array<{
    id: string;
    image_category: string;
    image_url: string;
    is_featured: boolean;
  }>;
}

interface PortfolioManagerProps {
  onNewProject: () => void;
  onEditProject?: (project: Project) => void;
}

export function PortfolioManager({ onNewProject, onEditProject }: PortfolioManagerProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReordering, setIsReordering] = useState(false);
  const [reorderList, setReorderList] = useState<Project[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    filterProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filterProjects reads from state vars already listed in deps
  }, [projects, searchTerm, serviceFilter, locationFilter, statusFilter, sortBy]);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          project_images!project_images_project_id_fkey (
            id,
            image_url,
            is_featured,
            image_category
          )
        `)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      
      // Transform the data to ensure project_images is always an array
      const transformedData = data?.map(project => ({
        ...project,
        project_images: Array.isArray(project.project_images) 
          ? project.project_images 
          : project.project_images 
            ? [project.project_images] 
            : []
      })) || [];
      
      setProjects(transformedData);
    } catch (error) {
      console.error('Error loading projects:', error);
      toast({
        title: "Error",
        description: "Failed to load projects",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filterProjects = () => {
    let filtered = [...projects];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(project =>
        project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.location.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.service_types.some(service => 
          service.toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    // Service filter
    if (serviceFilter !== 'all') {
      filtered = filtered.filter(project =>
        project.service_types.includes(serviceFilter)
      );
    }

    // Location filter
    if (locationFilter !== 'all') {
      filtered = filtered.filter(project =>
        project.location === locationFilter
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(project => {
        if (statusFilter === 'active') return project.active;
        if (statusFilter === 'featured') return project.featured;
        if (statusFilter === 'archived') return !project.active;
        return true;
      });
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'location':
          return a.location.localeCompare(b.location);
        case 'date_completed':
          return new Date(b.date_completed || 0).getTime() - new Date(a.date_completed || 0).getTime();
        case 'created_at':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    setFilteredProjects(filtered);
  };

  const handleBulkAction = async (action: 'delete' | 'archive' | 'feature' | 'activate') => {
    if (selectedProjects.length === 0) {
      toast({
        title: "No Selection",
        description: "Please select projects to perform bulk actions",
        variant: "destructive"
      });
      return;
    }

    const confirmMessage = `Are you sure you want to ${action} ${selectedProjects.length} project(s)?`;
    if (!confirm(confirmMessage)) return;

    try {
      let updateData: Record<string, boolean> = {};
      
      switch (action) {
        case 'delete':
          const { error: deleteError } = await supabase
            .from('projects')
            .delete()
            .in('id', selectedProjects);
          if (deleteError) throw deleteError;
          break;
        case 'archive':
          updateData = { active: false };
          break;
        case 'feature':
          updateData = { featured: true };
          break;
        case 'activate':
          updateData = { active: true };
          break;
      }

      if (action !== 'delete') {
        const { error } = await supabase
          .from('projects')
          .update(updateData)
          .in('id', selectedProjects);
        if (error) throw error;
      }

      setSelectedProjects([]);
      loadProjects();
      toast({
        title: "Success",
        description: `${selectedProjects.length} project(s) ${action}d successfully`
      });
    } catch (error) {
      console.error(`Error ${action}ing projects:`, error);
      toast({
        title: "Error",
        description: `Failed to ${action} projects`,
        variant: "destructive"
      });
    }
  };

  const deleteProject = async (project: Project) => {
    if (!confirm(`Are you sure you want to delete "${project.title}"?`)) return;

    try {
      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', project.id);

      if (error) throw error;
      
      loadProjects();
      toast({
        title: "Success",
        description: "Project deleted successfully"
      });
    } catch (error) {
      console.error('Error deleting project:', error);
      toast({
        title: "Error",
        description: "Failed to delete project",
        variant: "destructive"
      });
    }
  };

  const duplicateProject = async (project: Project) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, created_at: _created_at, project_images: _project_images, ...projectData } = project;
      const duplicatedProject = {
        ...projectData,
        title: `${project.title} (Copy)`,
        featured: false,
        sort_order: projects.length + 1
      };

      const { error } = await supabase
        .from('projects')
        .insert(duplicatedProject);

      if (error) throw error;
      
      loadProjects();
      toast({
        title: "Success",
        description: "Project duplicated successfully"
      });
    } catch (error) {
      console.error('Error duplicating project:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate project",
        variant: "destructive"
      });
    }
  };

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjects(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
  };

  const getFeaturedImage = (project: Project) => {
    const featuredImg = project.project_images?.find(img => img.is_featured);
    return featuredImg?.image_url || project.project_images?.[0]?.image_url || project.featured_image_id;
  };

  // --- Drag & Drop Reorder ---
  const startReordering = () => {
    // Use featured projects sorted by current sort_order for reorder mode
    const featured = projects
      .filter(p => p.featured && p.active)
      .sort((a, b) => a.sort_order - b.sort_order);
    setReorderList(featured);
    setIsReordering(true);
  };

  const cancelReordering = () => {
    setIsReordering(false);
    setReorderList([]);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...reorderList];
    const [moved] = updated.splice(draggedIndex, 1);
    updated.splice(dropIndex, 0, moved);
    setReorderList(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const moveProject = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= reorderList.length) return;
    const updated = [...reorderList];
    [updated[fromIndex], updated[toIndex]] = [updated[toIndex], updated[fromIndex]];
    setReorderList(updated);
  };

  const saveOrder = async () => {
    setIsSavingOrder(true);
    try {
      const updates = reorderList.map((project, index) => 
        supabase
          .from('projects')
          .update({ sort_order: index + 1 })
          .eq('id', project.id)
      );
      
      await Promise.all(updates);
      
      toast({
        title: "Order Saved",
        description: "Project display order updated successfully"
      });
      
      setIsReordering(false);
      setReorderList([]);
      loadProjects();
    } catch (error) {
      console.error('Error saving order:', error);
      toast({
        title: "Error",
        description: "Failed to save project order",
        variant: "destructive"
      });
    } finally {
      setIsSavingOrder(false);
    }
  };

  const uniqueServices = [...new Set(projects.flatMap(p => p.service_types))];
  const uniqueLocations = [...new Set(projects.map(p => p.location))];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Portfolio Manager</h2>
          <div className="flex items-center gap-3">
            <p className="text-muted-foreground">
              Manage your project portfolio ({filteredProjects.length} of {projects.length} projects)
            </p>
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-sm">
              <Star className="w-3 h-3 fill-current" />
              <span className="font-medium">{projects.filter(p => p.featured).length} Featured on Homepage</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={startReordering}>
            <ArrowUpDown className="w-4 h-4 mr-2" />
            Reorder
          </Button>
          <Button onClick={onNewProject}>
            <Plus className="w-4 h-4 mr-2" />
            Add New Project
          </Button>
        </div>
      </div>

      {/* Reorder Mode */}
      {isReordering && (
        <Card className="border-primary">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <ArrowUpDown className="w-5 h-5 text-primary" />
                  Reorder Featured Projects
                </h3>
                <p className="text-sm text-muted-foreground">
                  Drag and drop to set the display order on the homepage. #1 shows first.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={cancelReordering} disabled={isSavingOrder}>
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
                <Button size="sm" onClick={saveOrder} disabled={isSavingOrder}>
                  <Save className="w-4 h-4 mr-1" />
                  {isSavingOrder ? 'Saving...' : 'Save Order'}
                </Button>
              </div>
            </div>

            {reorderList.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No featured projects to reorder. Mark projects as featured first.
              </p>
            ) : (
              <div className="space-y-2">
                {reorderList.map((project, index) => (
                  <div
                    key={project.id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex items-center gap-3 p-3 rounded-lg border bg-background transition-all cursor-grab active:cursor-grabbing ${
                      draggedIndex === index ? 'opacity-50 scale-[0.98]' : ''
                    } ${
                      dragOverIndex === index ? 'border-primary border-2 bg-primary/5' : 'border-border'
                    }`}
                  >
                    <GripVertical className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    
                    <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm flex-shrink-0">
                      {index + 1}
                    </div>

                    <div className="relative w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                      {getFeaturedImage(project) ? (
                        <Image
                          src={getFeaturedImage(project)!}
                          alt={project.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Grid className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{project.title}</p>
                      <p className="text-sm text-muted-foreground truncate">{project.location}</p>
                    </div>

                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveProject(index, 'up')}
                        disabled={index === 0}
                      >
                        ▲
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => moveProject(index, 'down')}
                        disabled={index === reorderList.length - 1}
                      >
                        ▼
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filters and Search */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search projects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <Select value={serviceFilter} onValueChange={setServiceFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Service" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Services</SelectItem>
                  {uniqueServices.map(service => (
                    <SelectItem key={service} value={service}>{service}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {uniqueLocations.map(location => (
                    <SelectItem key={location} value={location}>{location}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="featured">Featured</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at">Newest</SelectItem>
                  <SelectItem value="title">Title</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
                  <SelectItem value="date_completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* View Mode */}
            <div className="flex gap-1 border rounded-md">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedProjects.length > 0 && (
        <Alert>
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span>{selectedProjects.length} project(s) selected</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('feature')}>
                  <Star className="w-4 h-4 mr-1" />
                  Feature
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleBulkAction('archive')}>
                  <Archive className="w-4 h-4 mr-1" />
                  Archive
                </Button>
                <Button size="sm" variant="destructive" onClick={() => handleBulkAction('delete')}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Projects Grid/List */}
      {filteredProjects.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="space-y-4">
              <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
                <Grid className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">No projects found</h3>
                <p className="text-muted-foreground mb-4">
                  {projects.length === 0 
                    ? "Get started by adding your first project"
                    : "Try adjusting your filters or search terms"
                  }
                </p>
                <Button onClick={onNewProject}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Project
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
          {filteredProjects.map((project) => (
            <Card key={project.id} className={`overflow-hidden ${viewMode === 'list' ? 'hover:shadow-md transition-shadow' : ''}`}>
              <div className={viewMode === 'list' ? 'flex' : ''}>
                {/* Project Image */}
                <div className={`relative ${viewMode === 'list' ? 'w-48 flex-shrink-0' : 'aspect-video'} bg-muted`}>
                  {getFeaturedImage(project) ? (
                    <Image
                      src={getFeaturedImage(project)!}
                      alt={project.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Grid className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  
                  {/* Selection Checkbox */}
                  <div className="absolute top-2 left-2">
                    <AdminCheckbox
                      checked={selectedProjects.includes(project.id)}
                      onCheckedChange={() => toggleProjectSelection(project.id)}
                      className="bg-white"
                    />
                  </div>

                  {/* Status Badges */}
                  <div className="absolute top-2 right-2 flex gap-1">
                    {project.featured && (
                      <Badge className="bg-yellow-500 text-white">
                        <Star className="w-3 h-3" />
                      </Badge>
                    )}
                    {!project.active && (
                      <Badge variant="secondary">Archived</Badge>
                    )}
                  </div>
                </div>

                {/* Project Details */}
                <div className={`p-4 ${viewMode === 'list' ? 'flex-1' : ''}`}>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-lg leading-tight">{project.title}</h3>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditProject?.(project)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateProject(project)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => window.open(`/projects/${project.id}`, '_blank')}>
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => deleteProject(project)}>
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4" />
                      {project.location}
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {project.service_types.slice(0, 2).map(service => (
                        <Badge key={service} variant="outline" className="text-xs">
                          {service}
                        </Badge>
                      ))}
                      {project.service_types.length > 2 && (
                        <Badge variant="outline" className="text-xs">
                          +{project.service_types.length - 2} more
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {project.date_completed ? 
                          new Date(project.date_completed).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'short' 
                          }) : 
                          'No date'
                        }
                      </div>
                      {project.budget_range && (
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4" />
                          {project.budget_range}
                        </div>
                      )}
                    </div>

                    {project.testimonial_rating > 0 && (
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${
                              i < project.testimonial_rating
                                ? 'text-yellow-500 fill-current'
                                : 'text-gray-300'
                            }`}
                          />
                        ))}
                        <span className="text-sm text-muted-foreground ml-1">
                          ({project.testimonial_rating}/5)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}