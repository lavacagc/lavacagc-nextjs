'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles, Search, Link, Target, TrendingUp, 
  ArrowRight, CheckCircle, Lightbulb, BarChart3,
  Loader2, Copy, RefreshCw
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ProjectFormData } from '../ProjectUploadSystem';

interface ProjectSEOStepProps {
  formData: ProjectFormData;
  updateFormData: (updates: Partial<ProjectFormData>) => void;
}

interface KeywordResult {
  keyword: string;
  source: 'autocomplete' | 'related' | 'ai';
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  competitiveness: 'low' | 'medium' | 'high';
  relevance: number;
}

interface KeywordResearch {
  primaryKeyword: string;
  keywords: KeywordResult[];
  suggestedTitle: string;
  suggestedMetaDescription: string;
  suggestedSlug: string;
  titleVariations: string[];
  searchInsights: string[];
  rawSuggestions: string[];
}

export function ProjectSEOStep({ formData, updateFormData }: ProjectSEOStepProps) {
  const [isResearching, setIsResearching] = useState(false);
  const [research, setResearch] = useState<KeywordResearch | null>(null);

  const runKeywordResearch = async () => {
    if (!formData.service_types.length || !formData.location) {
      toast({
        title: "Missing Info",
        description: "Go back and fill in service types and location first.",
        variant: "destructive",
      });
      return;
    }

    setIsResearching(true);
    try {
      const response = await fetch('/api/admin/keyword-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceTypes: formData.service_types,
          location: formData.location,
          projectTitle: formData.title,
          challenge: formData.challenge,
          solution: formData.solution,
          materials: formData.materials_used,
          features: formData.special_features,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Research failed');
      }

      const data: KeywordResearch = await response.json();
      setResearch(data);

      // Auto-fill fields if they're empty
      if (!formData.seo_title && data.suggestedTitle) {
        updateFormData({ seo_title: data.suggestedTitle });
      }
      if (!formData.meta_description && data.suggestedMetaDescription) {
        updateFormData({ meta_description: data.suggestedMetaDescription });
      }
      if (!formData.url_slug && data.suggestedSlug) {
        updateFormData({ url_slug: data.suggestedSlug });
      }
      if (!formData.focus_keyword && data.primaryKeyword) {
        updateFormData({ focus_keyword: data.primaryKeyword });
      }

      toast({
        title: "Research Complete! 🎯",
        description: `Found ${data.keywords.length} keyword opportunities from real search data.`,
      });
    } catch (error) {
      console.error('Keyword research error:', error);
      toast({
        title: "Research Failed",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setIsResearching(false);
    }
  };

  const applyTitle = (title: string) => {
    updateFormData({ seo_title: title });
    toast({ title: "Applied", description: "SEO title updated" });
  };

  const getIntentColor = (intent: string) => {
    switch (intent) {
      case 'transactional': return 'bg-green-100 text-green-800 border-green-200';
      case 'commercial': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'informational': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCompColor = (comp: string) => {
    switch (comp) {
      case 'low': return 'bg-green-50 text-green-700';
      case 'medium': return 'bg-yellow-50 text-yellow-700';
      case 'high': return 'bg-red-50 text-red-700';
      default: return 'bg-gray-50 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      {/* Research Button — THE MAIN CTA */}
      <Card className="border-primary/30 bg-gradient-to-r from-blue-50 to-purple-50">
        <CardContent className="p-6 text-center space-y-3">
          <div className="flex items-center justify-center gap-2 text-lg font-semibold">
            <Search className="w-5 h-5 text-primary" />
            What Are People Actually Searching?
          </div>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Pulls real Google autocomplete data for your service + location, then uses AI to pick the best keywords and generate optimized titles
          </p>
          <Button
            onClick={runKeywordResearch}
            disabled={isResearching}
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {isResearching ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Researching keywords...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                {research ? 'Re-run Research' : 'Research Keywords'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Search Insights */}
      {research?.searchInsights && research.searchInsights.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-amber-600" />
              <span className="font-semibold text-amber-900 text-sm">Search Insights</span>
            </div>
            <ul className="space-y-1">
              {research.searchInsights.map((insight, i) => (
                <li key={i} className="text-sm text-amber-800 flex items-start gap-2">
                  <ArrowRight className="w-3 h-3 mt-1 flex-shrink-0" />
                  {insight}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Keyword Opportunities */}
      {research?.keywords && research.keywords.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Keyword Opportunities ({research.keywords.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Real searches from Google Autocomplete • Click any keyword to use as focus keyword
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {research.keywords
                .sort((a, b) => b.relevance - a.relevance)
                .slice(0, 12)
                .map((kw, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => {
                    updateFormData({ focus_keyword: kw.keyword });
                    toast({ title: "Focus keyword set", description: kw.keyword });
                  }}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-8 text-center">
                      <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                    </div>
                    <span className="text-sm font-medium truncate">{kw.keyword}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="outline" className={`text-[10px] ${getIntentColor(kw.searchIntent)}`}>
                      {kw.searchIntent}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${getCompColor(kw.competitiveness)}`}>
                      {kw.competitiveness}
                    </Badge>
                    <div className="w-12 bg-muted rounded-full h-1.5">
                      <div 
                        className="bg-primary rounded-full h-1.5 transition-all"
                        style={{ width: `${kw.relevance}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SEO Title with Variations */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">SEO Title</CardTitle>
            <div className="flex items-center gap-2">
              {formData.seo_title && (
                <Badge variant={
                  formData.seo_title.length <= 60 
                    ? formData.seo_title.length >= 30 ? 'default' : 'secondary'
                    : 'destructive'
                }>
                  {formData.seo_title.length}/60
                </Badge>
              )}
              {research?.suggestedTitle && formData.seo_title !== research.suggestedTitle && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applyTitle(research.suggestedTitle)}
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Use AI Pick
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={formData.seo_title}
            onChange={(e) => updateFormData({ seo_title: e.target.value })}
            placeholder="Run keyword research first for data-driven suggestions"
            className={formData.seo_title.length > 60 ? 'border-red-300' : ''}
          />

          {/* Google Preview */}
          {formData.seo_title && (
            <div className="border rounded-lg p-3 bg-white">
              <p className="text-xs text-muted-foreground mb-1">Google Preview:</p>
              <div className="space-y-0.5">
                <p className="text-blue-700 text-lg font-normal leading-tight hover:underline cursor-default truncate">
                  {formData.seo_title}
                </p>
                <p className="text-green-700 text-sm truncate">
                  www.lavacagc.com/portfolio/{formData.url_slug || '...'}
                </p>
                <p className="text-gray-600 text-sm line-clamp-2">
                  {formData.meta_description || 'Add a meta description...'}
                </p>
              </div>
            </div>
          )}

          {/* Title Variations */}
          {research?.titleVariations && research.titleVariations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Alternative titles (click to use):
              </p>
              <div className="space-y-1.5">
                {research.titleVariations.map((title, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 rounded border hover:bg-muted/50 cursor-pointer group transition-colors"
                    onClick={() => applyTitle(title)}
                  >
                    <span className="text-sm truncate flex-1">{title}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Badge variant="secondary" className="text-[10px]">
                        {title.length}/60
                      </Badge>
                      <Copy className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meta Description */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Meta Description</CardTitle>
            <div className="flex items-center gap-2">
              {formData.meta_description && (
                <Badge variant={
                  formData.meta_description.length <= 160
                    ? formData.meta_description.length >= 120 ? 'default' : 'secondary'
                    : 'destructive'
                }>
                  {formData.meta_description.length}/160
                </Badge>
              )}
              {research?.suggestedMetaDescription && formData.meta_description !== research.suggestedMetaDescription && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    updateFormData({ meta_description: research!.suggestedMetaDescription });
                    toast({ title: "Applied", description: "Meta description updated" });
                  }}
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Use AI Pick
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={formData.meta_description}
            onChange={(e) => updateFormData({ meta_description: e.target.value })}
            placeholder="Run keyword research for a data-driven meta description"
            rows={3}
            className={formData.meta_description.length > 160 ? 'border-red-300' : ''}
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Focus Keyword */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="w-5 h-5" />
              Focus Keyword
            </CardTitle>
            {formData.focus_keyword && (
              <div className="space-y-1">
                {formData.seo_title.toLowerCase().includes(formData.focus_keyword.toLowerCase()) ? (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> In title ✓
                  </p>
                ) : (
                  <p className="text-xs text-red-600">⚠️ Not in title — add it for better ranking</p>
                )}
                {formData.meta_description.toLowerCase().includes(formData.focus_keyword.toLowerCase()) ? (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> In description ✓
                  </p>
                ) : (
                  <p className="text-xs text-amber-600">⚠️ Not in description</p>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent>
            <Input
              value={formData.focus_keyword}
              onChange={(e) => updateFormData({ focus_keyword: e.target.value })}
              placeholder="Click a keyword from research above"
            />
          </CardContent>
        </Card>

        {/* URL Slug */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Link className="w-5 h-5" />
                URL Slug
              </CardTitle>
              {research?.suggestedSlug && formData.url_slug !== research.suggestedSlug && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    updateFormData({ url_slug: research!.suggestedSlug });
                    toast({ title: "Applied" });
                  }}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  AI Slug
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              lavacagc.com/portfolio/<span className="font-medium">{formData.url_slug || '...'}</span>
            </p>
          </CardHeader>
          <CardContent>
            <Input
              value={formData.url_slug}
              onChange={(e) => updateFormData({ url_slug: e.target.value })}
              placeholder="auto-generated-from-research"
            />
          </CardContent>
        </Card>
      </div>

      {/* SEO Checklist */}
      <Card className="bg-gray-50">
        <CardContent className="p-4">
          <h4 className="font-semibold text-gray-900 mb-3 text-sm">SEO Checklist</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { check: !!formData.seo_title && formData.seo_title.length <= 60 && formData.seo_title.length >= 30, label: 'Title 30-60 chars' },
              { check: !!formData.meta_description && formData.meta_description.length <= 160 && formData.meta_description.length >= 120, label: 'Description 120-160 chars' },
              { check: !!formData.focus_keyword, label: 'Focus keyword set' },
              { check: !!formData.focus_keyword && formData.seo_title.toLowerCase().includes(formData.focus_keyword.toLowerCase()), label: 'Keyword in title' },
              { check: !!formData.url_slug, label: 'URL slug set' },
              { check: !!formData.focus_keyword && formData.url_slug.includes(formData.focus_keyword.split(' ')[0]?.toLowerCase()), label: 'Keyword in URL' },
              { check: formData.meta_description.includes('(201)') || formData.meta_description.includes('201-'), label: 'Phone in description' },
              { check: !!formData.location && formData.seo_title.toLowerCase().includes(formData.location.toLowerCase().split(',')[0]), label: 'Location in title' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                  item.check ? 'bg-green-500' : 'bg-gray-300'
                }`}>
                  {item.check && <CheckCircle className="w-3 h-3 text-white" />}
                </div>
                <span className={item.check ? 'text-green-700' : 'text-gray-500'}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
