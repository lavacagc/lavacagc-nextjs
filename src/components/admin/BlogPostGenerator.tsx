import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BlogPostGeneratorProps {
  onPostCreated?: (id: string) => void;
}

export function BlogPostGenerator({ onPostCreated }: BlogPostGeneratorProps) {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [information, setInformation] = useState('');
  const [category, setCategory] = useState('Kitchen Remodeling');
  const [tone, setTone] = useState('professional');
  const [isGenerating, setIsGenerating] = useState(false);

  const generatePost = async () => {
    if (!topic.trim()) {
      toast.error('Please enter a topic');
      return;
    }

    try {
      setIsGenerating(true);

      // Call the edge function to generate content
      const { data: generateData, error: generateError } = await supabase.functions.invoke(
        'generate-blog-post',
        {
          body: {
            topic: topic.trim(),
            information: information.trim(),
            category,
            tone,
          },
        }
      );

      if (generateError) throw generateError;
      if (!generateData?.generatedContent) throw new Error('No content generated');

      // Extract title from the generated content (first line starting with #)
      const lines = generateData.generatedContent.split('\n');
      const titleLine = lines.find((line: string) => line.startsWith('# '));
      const title = titleLine ? titleLine.replace('# ', '').trim() : topic;
      const content = generateData.generatedContent.replace(titleLine || '', '').trim();

      // Generate slug from title
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      // Create the blog post as draft
      const { data: postData, error: postError } = await supabase
        .from('blog_posts')
        .insert({
          title,
          slug,
          content,
          category,
          excerpt:
            content
              .substring(0, 200)
              .replace(/[#*>-]/g, '')
              .trim() + '...',
          published: false,
          author: 'Alex T.',
        })
        .select()
        .single();

      if (postError) throw postError;

      toast.success('Blog post generated as draft!');

      // Call the callback if provided, otherwise navigate
      if (onPostCreated && postData?.id) {
        onPostCreated(postData.id);
      } else {
        router.push(`/blog/${slug}`);
      }
    } catch (error) {
      console.error('Error generating post:', error);
      toast.error('Failed to generate blog post');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Blog Post Generator
        </CardTitle>
        <CardDescription>Create a new blog post from scratch using AI</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            Provide a topic and any specific information you want included. The AI will create a
            complete, well-structured blog post with styled boxes and professional formatting.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="topic">Topic *</Label>
            <Input
              id="topic"
              placeholder="e.g., 2025 Kitchen Design Trends"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={isGenerating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="information">Additional Information (Optional)</Label>
            <Textarea
              id="information"
              placeholder="Include any specific details, statistics, or points you want covered in the article..."
              value={information}
              onChange={(e) => setInformation(e.target.value)}
              rows={4}
              disabled={isGenerating}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory} disabled={isGenerating}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Kitchen Remodeling">Kitchen Remodeling</SelectItem>
                  <SelectItem value="Bathroom Renovation">Bathroom Renovation</SelectItem>
                  <SelectItem value="Home Additions">Home Additions</SelectItem>
                  <SelectItem value="Basement Finishing">Basement Finishing</SelectItem>
                  <SelectItem value="Design Trends">Design Trends</SelectItem>
                  <SelectItem value="Home Improvement Tips">Home Improvement Tips</SelectItem>
                  <SelectItem value="Cost Guides">Cost Guides</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tone">Tone</Label>
              <Select value={tone} onValueChange={setTone} disabled={isGenerating}>
                <SelectTrigger id="tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="expert">Expert</SelectItem>
                  <SelectItem value="conversational">Conversational</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={generatePost} disabled={isGenerating} className="w-full h-9">
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Post...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Blog Post
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
