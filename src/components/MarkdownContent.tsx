'use client'

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  if (!content) {
    return null;
  }

  return (
    <div className={`markdown-content ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ node, ...props }) => <h1 className="text-3xl font-bold text-text-primary mt-8 mb-4 first:mt-0" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-2xl font-bold text-text-primary mt-8 mb-4" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-xl font-semibold text-text-primary mt-6 mb-3" {...props} />,
          h4: ({ node, ...props }) => <h4 className="text-lg font-semibold text-text-primary mt-4 mb-2" {...props} />,
          p: ({ node, ...props }) => <p className="text-text-secondary mb-4 leading-relaxed" {...props} />,
          ul: ({ node, ...props }) => <ul className="list-disc ml-6 text-text-secondary mb-4 space-y-2" {...props} />,
          ol: ({ node, ...props }) => <ol className="list-decimal ml-6 text-text-secondary mb-4 space-y-2" {...props} />,
          li: ({ node, ...props }) => <li className="text-text-secondary leading-relaxed" {...props} />,
          blockquote: ({ node, children, ...props }) => {
            // Helper to extract text content from React children
            const getTextContent = (child: any): string => {
              if (typeof child === 'string') return child;
              if (Array.isArray(child)) return child.map(getTextContent).join('');
              if (child?.props?.children) return getTextContent(child.props.children);
              return '';
            };

            const textContent = getTextContent(children);
            const isChecklist = textContent.includes('<!-- checklist -->');
            const isListBox = textContent.includes('<!-- listbox -->');
            const isInfo = textContent.includes('<!-- info -->');
            const isWarning = textContent.includes('<!-- warning -->');

            // Remove HTML comments from display
            const cleanChildren = React.Children.map(children, child => {
              if (typeof child === 'string') {
                return child.replace(/<!--\s*\w+\s*-->/g, '').trim();
              }
              return child;
            });

            let className = "border-l-4 border-primary pl-4 pr-4 italic text-text-secondary my-4 py-3 rounded-r-md";

            if (isChecklist) {
              // White box with orange circular checkmarks
              className = "rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-6 my-6 not-italic shadow-sm [&_strong]:text-text-primary [&_strong]:text-lg [&_strong]:mb-3 [&_strong]:block [&_ul]:space-y-3 [&_ul]:mt-3 [&_li]:flex [&_li]:items-start [&_li]:gap-3 [&_li]:list-none [&_li]:ml-0 [&_li]:text-text-primary [&_li]:before:content-['✓'] [&_li]:before:flex [&_li]:before:items-center [&_li]:before:justify-center [&_li]:before:w-6 [&_li]:before:h-6 [&_li]:before:rounded-full [&_li]:before:bg-orange-500 [&_li]:before:text-white [&_li]:before:text-sm [&_li]:before:font-bold [&_li]:before:flex-shrink-0 [&_li]:before:mt-0.5";
            } else if (isListBox) {
              // Light blue/gray box for regular lists
              className = "rounded-xl bg-gray-50 dark:bg-gray-800/50 p-6 my-6 not-italic [&_strong]:text-text-primary [&_strong]:text-lg [&_strong]:mb-3 [&_strong]:block [&_ul]:space-y-2 [&_ul]:mt-3 [&_li]:text-text-primary";
            } else if (isInfo) {
              className = "border-l-4 border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30 pl-4 pr-4 text-text-secondary my-4 py-3 rounded-r-md [&_strong]:block [&_strong]:mb-2";
            } else if (isWarning) {
              className = "border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 pl-4 pr-4 text-text-secondary my-4 py-3 rounded-r-md [&_strong]:block [&_strong]:mb-2";
            } else {
              className = "border-l-4 border-primary bg-muted/30 pl-4 pr-4 italic text-text-secondary my-4 py-3 rounded-r-md";
            }

            return <blockquote className={className} {...props}>{cleanChildren}</blockquote>;
          },
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-text-primary" {...props}>{children}</code>;
            }
            return (
              <pre className="bg-muted p-4 rounded-lg my-4 overflow-x-auto">
                <code className="text-sm font-mono text-text-primary" {...props}>{children}</code>
              </pre>
            );
          },
          a: ({ node, href, children, ...props }) => {
            const isInternal = href?.startsWith('/');
            if (isInternal && href) {
              return (
                <Link href={href} className="text-primary hover:text-primary/80 underline font-medium" {...props}>
                  {children}
                </Link>
              );
            }
            return (
              <a href={href} className="text-primary hover:text-primary/80 underline font-medium" target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            );
          },
          strong: ({ node, ...props }) => <strong className="font-bold text-text-primary" {...props} />,
          em: ({ node, ...props }) => <em className="italic" {...props} />,
          hr: ({ node, ...props }) => <hr className="my-8 border-border" {...props} />,
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-4">
              <table className="min-w-full divide-y divide-border" {...props} />
            </div>
          ),
          th: ({ node, ...props }) => (
            <th className="px-4 py-2 bg-muted text-left text-text-primary font-semibold" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-2 border-t border-border text-text-secondary" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
