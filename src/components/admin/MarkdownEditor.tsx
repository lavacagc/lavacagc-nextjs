import React, { useState, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Eye, FileText, Info, Bold, Italic, List, ListOrdered, Link as LinkIcon, Square } from 'lucide-react';

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  rows?: number;
}

export function MarkdownEditor({ value, onChange, label, placeholder, rows = 10 }: MarkdownEditorProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const insertMarkdown = (before: string, after: string = '', placeholder: string = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end) || placeholder;
    const newText = value.substring(0, start) + before + selectedText + after + value.substring(end);
    
    onChange(newText);
    
    // Set cursor position after insertion
    setTimeout(() => {
      textarea.focus();
      const newPosition = start + before.length + selectedText.length;
      textarea.setSelectionRange(newPosition, newPosition);
    }, 0);
  };

  const insertCalloutBox = () => {
    const template = `\n> <!-- listbox -->\n> **Section Title:**\n> \n> - First item\n> - Second item\n> - Third item\n\n`;
    insertMarkdown(template);
  };

  const insertInfoBox = () => {
    const template = `\n> <!-- info -->\n> **Information**\n> \n> Important information goes here.\n\n`;
    insertMarkdown(template);
  };

  const insertWarningBox = () => {
    const template = `\n> <!-- warning -->\n> **Warning**\n> \n> Important warning message.\n\n`;
    insertMarkdown(template);
  };

  const insertChecklistBox = () => {
    const template = `\n> <!-- checklist -->\n> **Key Benefits**\n> \n> - First benefit\n> - Second benefit\n> - Third benefit\n\n`;
    insertMarkdown(template);
  };

  return (
    <TooltipProvider>
      <div className="space-y-2">
        {label && (
          <div className="flex items-center gap-2">
            <Label>{label}</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">Use Markdown syntax to format your content. Click the tabs below to switch between editing and preview.</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'edit' | 'preview')}>
          <TabsList className="grid w-full grid-cols-2 bg-muted">
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="edit" className="flex items-center gap-2 data-[state=active]:bg-background">
                  <FileText className="h-4 w-4" />
                  Edit Markdown
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>Write your content using Markdown syntax</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <TabsTrigger value="preview" className="flex items-center gap-2 data-[state=active]:bg-background">
                  <Eye className="h-4 w-4" />
                  Preview Output
                </TabsTrigger>
              </TooltipTrigger>
              <TooltipContent>
                <p>See how your content will look when published</p>
              </TooltipContent>
            </Tooltip>
          </TabsList>
        
        <TabsContent value="edit" className="mt-2">
          <div className="border rounded-md bg-muted/30">
            <div className="flex flex-wrap gap-1 p-2 border-b bg-background/50">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('**', '**', 'bold text')}
                    className="h-8 px-2"
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Bold text</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('*', '*', 'italic text')}
                    className="h-8 px-2"
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Italic text</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('\n- ', '', 'list item')}
                    className="h-8 px-2"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Bulleted list</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('\n1. ', '', 'list item')}
                    className="h-8 px-2"
                  >
                    <ListOrdered className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Numbered list</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => insertMarkdown('[', '](url)', 'link text')}
                    className="h-8 px-2"
                  >
                    <LinkIcon className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Insert link</TooltipContent>
              </Tooltip>

              <div className="w-px h-8 bg-border mx-1" />

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={insertCalloutBox}
                    className="h-8 px-3 text-xs"
                  >
                    <Square className="h-4 w-4 mr-1" />
                    List Box
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Insert styled box with regular bullet points</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={insertInfoBox}
                    className="h-8 px-3 text-xs"
                  >
                    ℹ️ Info
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Insert info box</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={insertWarningBox}
                    className="h-8 px-3 text-xs"
                  >
                    ⚠️ Warning
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Insert warning box</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={insertChecklistBox}
                    className="h-8 px-3 text-xs"
                  >
                    ✓ Checkmarks
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Insert white box with orange circular checkmarks</TooltipContent>
              </Tooltip>
            </div>
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder || 'Write your content in Markdown...'}
              rows={rows}
              className="font-mono text-sm border-0 rounded-t-none focus-visible:ring-0"
            />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            <p className="font-semibold mb-1">Markdown Guide:</p>
            <ul className="space-y-0.5 ml-4">
              <li>• # Heading 1, ## Heading 2, ### Heading 3</li>
              <li>• **bold** or __bold__</li>
              <li>• *italic* or _italic_</li>
              <li>• [Link text](url)</li>
              <li>• - List item or * List item</li>
              <li>• 1. Numbered list</li>
              <li>• {`>`} Blockquote</li>
              <li>• `code` or ```code block```</li>
            </ul>
          </div>
        </TabsContent>
        
        <TabsContent value="preview" className="mt-2">
          <div className="border rounded-md p-4 min-h-[200px] bg-background">
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {value || '*No content to preview*'}
              </ReactMarkdown>
            </div>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </TooltipProvider>
  );
}
