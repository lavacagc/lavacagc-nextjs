import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { 
  Sparkles, 
  Wand2, 
  FileText, 
  MessageSquare, 
  MapPin, 
  BarChart3, 
  List, 
  Copy, 
  Save, 
  History, 
  Lightbulb,
  Loader2,
  Plus,
  Calendar,
  Target,
  Star,
  Trash2
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import HorizontalNav from '@/components/HorizontalNav';

interface AIContentHistory {
  id: string;
  prompt: string;
  generated_content: string;
  prompt_category: string;
  tone: string;
  length_type: string;
  created_at: string;
}

interface AIContentSnippet {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  created_at: string;
}

interface QuickPrompt {
  id: string;
  label: string;
  description: string;
  action: string;
  icon: React.ReactNode;
  color: string;
}

export function AIContentAssistant() {
  console.log('AIContentAssistant component is rendering');
  
  const [activeTab, setActiveTab] = useState('quick-prompts');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedContent, setGeneratedContent] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [selectedTone, setSelectedTone] = useState('professional');
  const [selectedLength, setSelectedLength] = useState('medium');
  const [contentHistory, setContentHistory] = useState<AIContentHistory[]>([]);
  const [savedSnippets, setSavedSnippets] = useState<AIContentSnippet[]>([]);
  const [currentContext, setCurrentContext] = useState({
    title: '',
    keyword: '',
    topic: ''
  });
  const [bulkKeywords, setBulkKeywords] = useState('');
  const [smartSuggestions, setSmartSuggestions] = useState<any>(null);
  const [selectedText, setSelectedText] = useState('');

  const aiNavItems = [
    { id: 'quick-prompts', icon: Wand2, label: 'Quick Prompts', width: '110px' },
    { id: 'custom', icon: FileText, label: 'Custom AI', width: '90px' },
    { id: 'suggestions', icon: Lightbulb, label: 'Smart Suggestions', width: '140px' },
    { id: 'bulk', icon: List, label: 'Bulk Generator', width: '115px' },
    { id: 'history', icon: History, label: 'History & Snippets', width: '140px' },
  ];
  
  // Quick prompts configuration
  const quickPrompts: QuickPrompt[] = [
    {
      id: 'intro',
      label: 'Write Intro Paragraph',
      description: 'Generate engaging introduction using title and keyword',
      action: 'intro_paragraph',
      icon: <FileText className="w-4 h-4" />,
      color: 'bg-blue-500'
    },
    {
      id: 'faq',
      label: 'Generate FAQ Section',
      description: 'Create 5 Q&As based on topic',
      action: 'generate_faq',
      icon: <MessageSquare className="w-4 h-4" />,
      color: 'bg-green-500'
    },
    {
      id: 'meta',
      label: 'Create Meta Description',
      description: 'Generate 3 meta description options',
      action: 'meta_description',
      icon: <Target className="w-4 h-4" />,
      color: 'bg-purple-500'
    },
    {
      id: 'expand',
      label: 'Expand Section',
      description: 'Expand highlighted text with more details',
      action: 'expand_section',
      icon: <Wand2 className="w-4 h-4" />,
      color: 'bg-orange-500'
    },
    {
      id: 'local',
      label: 'Make More Local',
      description: 'Add Northern NJ/town references',
      action: 'add_local_references',
      icon: <MapPin className="w-4 h-4" />,
      color: 'bg-teal-500'
    },
    {
      id: 'stats',
      label: 'Add Statistics',
      description: 'Insert relevant industry stats',
      action: 'add_statistics',
      icon: <BarChart3 className="w-4 h-4" />,
      color: 'bg-red-500'
    },
    {
      id: 'outline',
      label: 'Generate Outline',
      description: 'Create H2/H3 structure based on keyword',
      action: 'generate_outline',
      icon: <List className="w-4 h-4" />,
      color: 'bg-indigo-500'
    }
  ];

  useEffect(() => {
    loadContentHistory();
    loadSavedSnippets();
  }, []);

  const loadContentHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_content_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setContentHistory(data || []);
    } catch (error) {
      console.error('Error loading content history:', error);
    }
  };

  const loadSavedSnippets = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_content_snippets')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSavedSnippets(data || []);
    } catch (error) {
      console.error('Error loading saved snippets:', error);
    }
  };

  const generateContent = async (action: string, prompt?: string) => {
    if (!currentContext.title && !customPrompt && !prompt && action !== 'smart_suggestions') {
      toast({
        title: "Missing Context",
        description: "Please provide article title and keyword, or use custom prompt.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-content-assistant', {
        body: {
          action,
          prompt: prompt || selectedText,
          customPrompt,
          tone: selectedTone,
          length: selectedLength,
          context: currentContext,
          location: 'Northern New Jersey'
        }
      });

      if (error) throw error;

      if (data?.success) {
        if (action === 'smart_suggestions') {
          try {
            const suggestions = JSON.parse(data.generatedContent);
            setSmartSuggestions(suggestions);
          } catch {
            setSmartSuggestions({ error: 'Could not parse suggestions' });
          }
        } else {
          setGeneratedContent(data.generatedContent);
        }
        
        await loadContentHistory(); // Refresh history
        
        toast({
          title: "Content Generated!",
          description: "Your AI-generated content is ready.",
        });
      } else {
        throw new Error(data?.error || 'Failed to generate content');
      }
    } catch (error) {
      console.error('Error generating content:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to generate content. Please try again.";
      toast({
        title: "AI Generation Error", 
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateBulkOutlines = async () => {
    if (!bulkKeywords.trim()) {
      toast({
        title: "No Keywords",
        description: "Please enter keywords for bulk generation.",
        variant: "destructive"
      });
      return;
    }

    setIsGenerating(true);
    
    try {
      const keywords = bulkKeywords.split('\n').map(k => k.trim()).filter(k => k);
      
      const { data, error } = await supabase.functions.invoke('ai-content-assistant', {
        body: {
          action: 'bulk_outlines',
          keywords,
          tone: selectedTone,
          location: 'Northern New Jersey'
        }
      });

      if (error) throw error;

      if (data?.success) {
        setGeneratedContent(data.generatedContent);
        await loadContentHistory();
        
        toast({
          title: "Bulk Outlines Generated!",
          description: `Created outlines for ${keywords.length} topics.`,
        });
      }
    } catch (error) {
      console.error('Error generating bulk outlines:', error);
      toast({
        title: "Error",
        description: "Failed to generate bulk outlines. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      toast({
        title: "Copied!",
        description: "Content copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Could not copy to clipboard.",
        variant: "destructive"
      });
    }
  };

  const saveAsSnippet = async (content: string, title?: string) => {
    const snippetTitle = title || prompt('Enter a title for this snippet:');
    if (!snippetTitle) return;

    try {
      const { error } = await supabase
        .from('ai_content_snippets')
        .insert({
          title: snippetTitle,
          content,
          category: 'ai_generated',
          tags: [selectedTone, selectedLength]
        });

      if (error) throw error;
      
      await loadSavedSnippets();
      
      toast({
        title: "Snippet Saved!",
        description: "Content saved to your snippets library.",
      });
    } catch (error) {
      console.error('Error saving snippet:', error);
      toast({
        title: "Save Failed",
        description: "Could not save snippet.",
        variant: "destructive"
      });
    }
  };

  const deleteSnippet = async (id: string) => {
    try {
      const { error } = await supabase
        .from('ai_content_snippets')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await loadSavedSnippets();
      
      toast({
        title: "Snippet Deleted",
        description: "Snippet removed from your library.",
      });
    } catch (error) {
      console.error('Error deleting snippet:', error);
    }
  };

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between max-w-full">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Sparkles className="w-8 h-8 text-primary" />
            AI Content Assistant
          </h1>
          <p className="text-muted-foreground">
            Generate high-quality content for your blog posts and marketing materials
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 max-w-full overflow-x-hidden">
        <HorizontalNav 
          activeTab={activeTab}
          onTabChange={setActiveTab}
          items={aiNavItems}
        />

        {/* Article Context */}
        <Card className="max-w-full">
          <CardHeader>
            <CardTitle className="text-lg">Article Context</CardTitle>
            <CardDescription>
              Provide context about the article you're working on for better AI generation
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="title">Article Title</Label>
              <Input
                id="title"
                placeholder="e.g. Kitchen Remodeling Guide"
                value={currentContext.title}
                onChange={(e) => setCurrentContext(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="keyword">Primary Keyword</Label>
              <Input
                id="keyword"
                placeholder="e.g. kitchen remodeling"
                value={currentContext.keyword}
                onChange={(e) => setCurrentContext(prev => ({ ...prev, keyword: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="topic">Topic/Focus</Label>
              <Input
                id="topic"
                placeholder="e.g. costs, process, design"
                value={currentContext.topic}
                onChange={(e) => setCurrentContext(prev => ({ ...prev, topic: e.target.value }))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Quick Prompts */}
        <TabsContent value="quick-prompts" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Prompt Actions</CardTitle>
              <CardDescription>
                Click any button below to instantly generate content based on your article context
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {quickPrompts.map((prompt) => (
                  <Button
                    key={prompt.id}
                    variant="outline"
                    className="h-auto p-4 flex flex-col items-start gap-2 text-left"
                    onClick={() => generateContent(prompt.action)}
                    disabled={isGenerating}
                  >
                    <div className={`p-2 rounded-md text-white ${prompt.color}`}>
                      {prompt.icon}
                    </div>
                    <div className="space-y-1">
                      <div className="font-semibold">{prompt.label}</div>
                      <div className="text-sm text-muted-foreground">
                        {prompt.description}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
              
              {/* Expand Section Tool */}
              <div className="mt-6 p-4 border rounded-lg">
                <Label htmlFor="selected-text" className="text-sm font-medium">
                  Expand Selected Text
                </Label>
                <Textarea
                  id="selected-text"
                  placeholder="Paste text here to expand it with more details..."
                  value={selectedText}
                  onChange={(e) => setSelectedText(e.target.value)}
                  className="mt-2"
                />
                <Button 
                  className="mt-2" 
                  onClick={() => generateContent('expand_section', selectedText)}
                  disabled={!selectedText.trim() || isGenerating}
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Expand This Text
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Custom AI Interface */}
        <TabsContent value="custom" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Custom AI Prompt</CardTitle>
              <CardDescription>
                Write your own custom prompt for AI content generation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tone</Label>
                  <Select value={selectedTone} onValueChange={setSelectedTone}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                      <SelectItem value="educational">Educational</SelectItem>
                      <SelectItem value="persuasive">Persuasive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Length</Label>
                  <Select value={selectedLength} onValueChange={setSelectedLength}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short">Short (50 words)</SelectItem>
                      <SelectItem value="medium">Medium (200 words)</SelectItem>
                      <SelectItem value="long">Long (500+ words)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="custom-prompt">Your Custom Prompt</Label>
                <Textarea
                  id="custom-prompt"
                  placeholder="Write your custom prompt here... Be specific about what you want the AI to generate."
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="min-h-[120px] mt-2"
                />
              </div>
              
              <Button 
                onClick={() => generateContent('custom')}
                disabled={!customPrompt.trim() || isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Generate Custom Content
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Smart Suggestions */}
        <TabsContent value="suggestions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5" />
                Smart Suggestions
              </CardTitle>
              <CardDescription>
                AI-powered suggestions based on your article context
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => generateContent('smart_suggestions')}
                disabled={!currentContext.title || isGenerating}
                className="mb-4"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Lightbulb className="w-4 h-4 mr-2" />
                )}
                Generate Smart Suggestions
              </Button>

              {smartSuggestions && !smartSuggestions.error && (
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold mb-2">Related Blog Posts to Link To:</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {smartSuggestions.relatedPosts?.map((post: string, idx: number) => (
                        <li key={idx} className="text-sm">{post}</li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Portfolio Projects to Showcase:</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {smartSuggestions.portfolioProjects?.map((project: string, idx: number) => (
                        <li key={idx} className="text-sm">{project}</li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Call-to-Action Ideas:</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {smartSuggestions.callToActions?.map((cta: string, idx: number) => (
                        <li key={idx} className="text-sm">{cta}</li>
                      ))}
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Related Keywords:</h4>
                    <div className="flex flex-wrap gap-2">
                      {smartSuggestions.keywords?.map((keyword: string, idx: number) => (
                        <Badge key={idx} variant="outline">{keyword}</Badge>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="font-semibold mb-2">Customer Questions:</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {smartSuggestions.customerQuestions?.map((question: string, idx: number) => (
                        <li key={idx} className="text-sm">{question}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bulk Generator */}
        <TabsContent value="bulk" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Bulk Content Generator
              </CardTitle>
              <CardDescription>
                Generate multiple article outlines and drafts at once
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="bulk-keywords">Keywords/Topics (one per line)</Label>
                <Textarea
                  id="bulk-keywords"
                  placeholder="Kitchen remodeling costs&#10;Bathroom renovation timeline&#10;Home addition permits&#10;Basement finishing ideas"
                  value={bulkKeywords}
                  onChange={(e) => setBulkKeywords(e.target.value)}
                  className="min-h-[120px] mt-2"
                />
              </div>
              
              <Button 
                onClick={generateBulkOutlines}
                disabled={!bulkKeywords.trim() || isGenerating}
                className="w-full"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Generate Bulk Article Outlines
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* History & Snippets */}
        <TabsContent value="history" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Content History */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="w-5 h-5" />
                  Recent Generations
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {contentHistory.map((item) => (
                      <div key={item.id} className="p-3 border rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="text-xs">
                            {item.prompt_category}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {item.tone}
                          </Badge>
                          <span className="text-xs text-muted-foreground ml-auto">
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {item.prompt}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(item.generated_content)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => saveAsSnippet(item.generated_content)}
                          >
                            <Save className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Saved Snippets */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="w-5 h-5" />
                  Saved Snippets
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {savedSnippets.map((snippet) => (
                      <div key={snippet.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-sm">{snippet.title}</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => deleteSnippet(snippet.id)}
                            className="h-6 w-6 p-0 text-red-500"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {snippet.content}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {snippet.category}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(snippet.content)}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Generated Content Display */}
      {generatedContent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              Generated Content
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(generatedContent)}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveAsSnippet(generatedContent)}
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save as Snippet
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/30 p-4 rounded-lg">
              <pre className="whitespace-pre-wrap text-sm font-mono">
                {generatedContent}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {isGenerating && (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="flex items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Generating content with AI...</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}